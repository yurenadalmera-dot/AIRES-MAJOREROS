"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { cifrar } from "@/lib/secretos";
import { generarToken, huellaDelToken } from "@/lib/token-importacion";
import { problemasDelViajero } from "@/lib/viajeros";
import { reservaDelEnlace } from "@/lib/parte-viajeros";

/**
 * Los viajeros de una reserva.
 *
 * Dos caminos entran aquí: la gestora, desde la ficha de la reserva, y el
 * propio huésped desde un enlace público. El enlace es de un solo uso lógico
 * —se puede volver a abrir mientras no caduque— y **de él solo se guarda la
 * huella**, igual que el token de importación: se enseña una vez y, si se
 * pierde, se genera otro.
 *
 * El documento y el número de soporte se guardan **cifrados** (AES-256-GCM,
 * `lib/secretos.ts`). Son datos de identificación: un volcado de la base no
 * puede entregarlos. Lo demás —nombre, nacionalidad, fecha— se guarda en
 * claro porque hace falta para buscar y ordenar, y por sí solo no identifica
 * a nadie de forma unívoca.
 */

/** Cuánto dura el enlace que se le manda al huésped. */
const DIAS_DE_VALIDEZ = 30;

const viajeroSchema = z.object({
  nombre: z.string().min(1),
  apellido1: z.string().min(1),
  apellido2: z.string().optional(),
  tipoDocumento: z.enum(["NIF", "NIE", "PAS", "OTRO"]),
  documento: z.string().min(1),
  numeroSoporte: z.string().optional(),
  nacionalidad: z.string().min(1),
  fechaNacimiento: z.string().min(1),
  sexo: z.string().optional(),
  direccion: z.string().optional(),
  municipio: z.string().optional(),
  provincia: z.string().optional(),
  pais: z.string().optional(),
  codigoPostal: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().optional(),
  parentesco: z.string().optional(),
  titular: z.union([z.literal("on"), z.literal("true"), z.literal("")]).optional(),
});

/**
 * Genera el enlace con el que el huésped rellena sus datos.
 *
 * Devuelve el enlace **entero y una sola vez**. No se puede volver a
 * consultar: aquí queda su huella. Generar otro invalida el anterior.
 */
export async function generarEnlaceDelParte(bookingId: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");

    const reserva = await prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true },
    });
    if (!reserva) throw new ErrorDeNegocio("Esa reserva no existe.");

    const token = generarToken();
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        huellaFormulario: huellaDelToken(token),
        formularioExpira: addDays(new Date(), DIAS_DE_VALIDEZ),
      },
    });

    revalidatePath(`/rental/bookings/${bookingId}`);
    revalidatePath("/rental/viajeros");
    return { token, dias: DIAS_DE_VALIDEZ };
  });
}

/**
 * Guarda un viajero desde el formulario público.
 *
 * No lleva sesión: la autorización es el propio enlace. Por eso todo lo que
 * decide a qué reserva se escribe sale del token, nunca del formulario — si
 * el `bookingId` viniera en un campo oculto, cualquiera podría cambiarlo y
 * escribir en la reserva de otro.
 */
export async function guardarViajero(token: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const reserva = await reservaDelEnlace(token);
    if (!reserva) {
      throw new ErrorDeNegocio(
        "Este enlace ya no vale. Pídele uno nuevo a quien te lo mandó."
      );
    }
    if (reserva.comunicadoEl) {
      throw new ErrorDeNegocio("Los datos de esta reserva ya se han comunicado y no se pueden cambiar.");
    }

    const datos = viajeroSchema.parse(Object.fromEntries(formData.entries()));
    const fechaNacimiento = new Date(datos.fechaNacimiento);
    if (Number.isNaN(fechaNacimiento.getTime())) {
      throw new ErrorDeNegocio("La fecha de nacimiento no se entiende.");
    }

    // Las mismas comprobaciones que ve la persona, otra vez aquí: el
    // formulario del navegador se puede saltar, esto no.
    const fallos = problemasDelViajero(
      { ...datos, fechaNacimiento, apellido2: datos.apellido2 || null },
      reserva.checkIn
    );
    if (fallos.length > 0) throw new ErrorDeNegocio(fallos.join(" "));

    // El titular es uno solo: si este lo es, deja de serlo el que lo fuera.
    const esTitular = Boolean(datos.titular) || reserva.huespedes.length === 0;
    if (esTitular) {
      await prisma.huesped.updateMany({
        where: { bookingId: reserva.id, titular: true },
        data: { titular: false },
      });
    }

    await prisma.huesped.create({
      data: {
        bookingId: reserva.id,
        titular: esTitular,
        nombre: datos.nombre.trim(),
        apellido1: datos.apellido1.trim(),
        apellido2: datos.apellido2?.trim() || null,
        tipoDocumento: datos.tipoDocumento,
        documento: cifrar(datos.documento.trim().toUpperCase()),
        numeroSoporte: datos.numeroSoporte?.trim()
          ? cifrar(datos.numeroSoporte.trim().toUpperCase())
          : null,
        nacionalidad: datos.nacionalidad.trim().toUpperCase(),
        fechaNacimiento,
        sexo: datos.sexo || null,
        direccion: datos.direccion?.trim() || null,
        municipio: datos.municipio?.trim() || null,
        provincia: datos.provincia?.trim() || null,
        pais: datos.pais?.trim() || null,
        codigoPostal: datos.codigoPostal?.trim() || null,
        telefono: datos.telefono?.trim() || null,
        email: datos.email?.trim() || null,
        parentesco: datos.parentesco?.trim() || null,
      },
    });

    revalidatePath(`/rental/bookings/${reserva.id}`);
    revalidatePath("/rental/viajeros");
  });
}

/** Quita un viajero de una reserva. Desde dentro, con sesión. */
export async function borrarViajero(huespedId: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const h = await prisma.huesped.findFirst({
      where: { id: huespedId, booking: { organizationId } },
      select: { id: true, bookingId: true, booking: { select: { comunicadoEl: true } } },
    });
    if (!h) throw new ErrorDeNegocio("Ese viajero no existe.");
    if (h.booking.comunicadoEl) {
      throw new ErrorDeNegocio("Ya se comunicó el parte de esta reserva: no se puede cambiar.");
    }
    await prisma.huesped.delete({ where: { id: huespedId } });
    revalidatePath(`/rental/bookings/${h.bookingId}`);
    revalidatePath("/rental/viajeros");
  });
}

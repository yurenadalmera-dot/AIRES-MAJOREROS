/**
 * Lecturas del parte de viajeros. **No es un fichero de acciones**, y eso
 * importa: en un módulo `"use server"` todo lo que se exporta queda expuesto
 * como acción invocable desde el navegador, y estas dos funciones buscan por
 * token y descifran documentos. Aquí no se pueden llamar desde fuera.
 */

import { prisma } from "./prisma";
import { descifrar } from "./secretos";
import { huellaDelToken } from "./token-importacion";

/** La reserva a la que abre un enlace, o `null` si no vale o ha caducado. */
export async function reservaDelEnlace(token: string) {
  const reserva = await prisma.booking.findFirst({
    where: { huellaFormulario: huellaDelToken(token) },
    select: {
      id: true,
      guestName: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      children: true,
      formularioExpira: true,
      comunicadoEl: true,
      property: { select: { name: true, locality: true } },
      huespedes: {
        select: { id: true, nombre: true, apellido1: true, apellido2: true, titular: true },
        orderBy: { creadoEl: "asc" },
      },
    },
  });
  if (!reserva) return null;
  if (reserva.formularioExpira && reserva.formularioExpira < new Date()) return null;
  return reserva;
}

/**
 * Los viajeros de una reserva, descifrados, para enseñarlos dentro.
 *
 * `descifrar` devuelve `null` si no se puede leer —por ejemplo si cambió
 * `AUTH_SECRET`—, y entonces se dice que no se puede leer en vez de enseñar
 * un churro cifrado.
 */
export async function viajerosDeLaReserva(organizationId: string, bookingId: string) {
  const huespedes = await prisma.huesped.findMany({
    where: { bookingId, booking: { organizationId } },
    orderBy: [{ titular: "desc" }, { creadoEl: "asc" }],
  });

  return huespedes.map((h) => ({
    ...h,
    documento: descifrar(h.documento) ?? "(no se puede leer)",
    numeroSoporte: h.numeroSoporte ? descifrar(h.numeroSoporte) ?? "(no se puede leer)" : null,
  }));
}

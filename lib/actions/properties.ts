"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { cifrar } from "@/lib/secretos";


/**
 * Refresca todas las pantallas donde sale una vivienda.
 *
 * Dar de baja una vivienda solo refrescaba el listado y los ajustes, así que
 * el panel y el calendario seguían enseñándola como si nada. Cada sitio que
 * la muestra tiene que enterarse, no solo el sitio donde se cambia.
 */
function revalidarVistasDeViviendas() {
  for (const ruta of [
    "/rental",
    "/rental/properties",
    "/rental/settings",
    "/rental/calendar",
    "/rental/tasks",
    "/rental/reports",
    "/cleaning",
    "/cleaning/tasks",
  ]) {
    revalidatePath(ruta);
  }
}

/** Vacío significa «no paga cuota fija», no «cuota de cero». */
function leerCuota(texto: string | undefined): number | null {
  const limpio = (texto ?? "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) {
    throw new ErrorDeNegocio("La cuota mensual tiene que ser un número.");
  }
  return n;
}

/** Vacío significa «no se cobra gestión», no «cero por ciento escrito». */
function leerPorcentaje(texto: string | undefined): number | null {
  const limpio = (texto ?? "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ErrorDeNegocio("La comisión de gestión tiene que estar entre 0 y 100.");
  }
  return n;
}

const propertySchema = z.object({
  name: z.string().min(1),
  locality: z.string().min(1),
  address: z.string().optional(),
  capacity: z.coerce.number().int().min(1).default(2),
  bedrooms: z.coerce.number().int().min(0).default(1),
  bathrooms: z.coerce.number().int().min(0).default(1),
  cleaningPrice: z.coerce.number().min(0).default(0),
  ownerId: z.string().optional(),
  lodgifyPropertyId: z.string().optional(),
  /** Vacío = a esta vivienda no se le cobra gestión. */
  managementPct: z.string().optional(),
  /** El grupo del que hereda la comisión. Vacío = vivienda suelta. */
  groupId: z.string().optional(),
});

export async function createProperty(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const raw = Object.fromEntries(formData.entries());
    const data = propertySchema.parse(raw);

    await prisma.property.create({
      data: {
        organizationId,
        name: data.name,
        locality: data.locality,
        address: data.address || null,
        capacity: data.capacity,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        cleaningPrice: data.cleaningPrice,
        ownerId: data.ownerId || null,
        lodgifyPropertyId: data.lodgifyPropertyId || null,
        managementPct: leerPorcentaje(data.managementPct),
        groupId: data.groupId || null,
        active: true,
      },
    });

    revalidarVistasDeViviendas();
  });
}

export async function updateProperty(propertyId: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const raw = Object.fromEntries(formData.entries());
    const data = propertySchema.parse(raw);

    await prisma.property.updateMany({
      where: { id: propertyId, organizationId },
      data: {
        name: data.name,
        locality: data.locality,
        address: data.address || null,
        capacity: data.capacity,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        cleaningPrice: data.cleaningPrice,
        ownerId: data.ownerId || null,
        lodgifyPropertyId: data.lodgifyPropertyId || null,
        managementPct: leerPorcentaje(data.managementPct),
        groupId: data.groupId || null,
      },
    });

    // El precio viaja también a las limpiezas de esta vivienda que todavía no
    // se han facturado.
    //
    // Cada limpieza guarda su precio en el momento de crearse, para que una
    // subida de tarifas no reescriba lo ya cobrado. Pero eso, con las
    // viviendas que llegan de Lodgify, dejaba una trampa: entran con precio 0
    // —Lodgify no sabe nada de limpiezas— y todas sus limpiezas nacían a cero.
    // Ponerle después el precio a la vivienda no arreglaba ninguna, así que
    // las facturas salían a 0 € sin que nada lo advirtiera.
    //
    // Lo facturado no se toca: eso ya es historia.
    const { count: limpiezasActualizadas } = await prisma.cleaningTask.updateMany({
      where: { propertyId, organizationId, invoiceId: null },
      data: { price: data.cleaningPrice },
    });

    revalidarVistasDeViviendas();

    return { limpiezasActualizadas };
  });
}

export async function setPropertyManualStatus(propertyId: string, status: string | null) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    await prisma.property.updateMany({
      where: { id: propertyId, organizationId },
      data: { manualStatus: status },
    });
    revalidarVistasDeViviendas();
  });
}

export async function setPropertyActive(propertyId: string, active: boolean) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    await prisma.property.updateMany({ where: { id: propertyId, organizationId }, data: { active } });
    revalidarVistasDeViviendas();
  });
}

const ownerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  /** NIF/CIF y domicilio: hacen falta para poder facturarle. */
  taxId: z.string().optional(),
  address: z.string().optional(),
  /** Cuota fija mensual de gestión, si la paga. Vacío = cobra por porcentaje. */
  monthlyFee: z.string().optional(),
  /** Desde cuándo se le cobra esa cuota. */
  monthlyFeeDesde: z.string().optional(),
  /** Qué recibe de Aires por las limpiezas: factura fiscal o solo el resumen. */
  documentoLimpieza: z.enum(["FACTURA", "RESUMEN"]).optional(),
});

const datosFiscalesSchema = z.object({
  ownerId: z.string().min(1),
  taxId: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  documentoLimpieza: z.enum(["FACTURA", "RESUMEN"]).default("FACTURA"),
});

/**
 * Los datos con los que se le factura a un propietario.
 *
 * Existe porque hasta ahora un propietario solo se podía crear, no corregir, y
 * los que vinieron de Mirador llegaron sin NIF ni domicilio — sin los cuales
 * la factura no cumple el RD 1619/2012 y el sistema se niega a emitirla.
 */
/**
 * Los datos del propietario: NIF, domicilio, correo y qué documento recibe.
 *
 * Va con `operativa.alquiler`, no con `administracion`. Los propietarios son
 * la cartera de alquiler y quien la lleva es quien habla con ellos: pedirle
 * el CIF a un propietario y luego no poder escribirlo es la clase de tope que
 * acaba en un papel encima de la mesa. Además dar de alta al propietario ya
 * iba con este permiso, así que se podía crear uno y no poder completarlo.
 *
 * Lo que sigue pidiendo administración es otra cosa: el reparto entre socias,
 * las cuentas de usuario y las credenciales.
 */
export async function guardarDatosFiscalesDelPropietario(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = datosFiscalesSchema.parse(Object.fromEntries(formData.entries()));

    const existe = await prisma.owner.findFirst({
      where: { id: data.ownerId, organizationId },
      select: { id: true },
    });
    if (!existe) throw new ErrorDeNegocio("Ese propietario no existe.");

    await prisma.owner.update({
      where: { id: data.ownerId },
      data: {
        taxId: data.taxId?.trim() || null,
        address: data.address?.trim() || null,
        email: data.email?.trim() || null,
        documentoLimpieza: data.documentoLimpieza,
      },
    });

    revalidatePath("/rental/settings");
    revalidatePath("/cleaning");
  });
}

const llegadaSchema = z.object({
  propertyId: z.string().min(1),
  address: z.string().optional(),
  comoLlegar: z.string().optional(),
  mapaUrl: z.string().optional(),
  horaEntrada: z.string().optional(),
  horaSalida: z.string().optional(),
  wifiRed: z.string().optional(),
  wifiClave: z.string().optional(),
  normas: z.string().optional(),
  codigoLlave: z.string().optional(),
});

/**
 * Lo que hay que contarle al huésped para que llegue y entre.
 *
 * El código de la caja de llaves se guarda **cifrado** y no se vuelve a
 * enseñar: es una llave, no un dato. Dejarlo en blanco no lo borra —eso
 * obligaría a volver a escribirlo cada vez que se corrige una falta de
 * ortografía en «cómo llegar»—; para quitarlo hay que escribir un guion.
 */
export async function guardarLlegadaDeLaVivienda(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = llegadaSchema.parse(Object.fromEntries(formData.entries()));

    const existe = await prisma.property.findFirst({
      where: { id: data.propertyId, organizationId },
      select: { id: true },
    });
    if (!existe) throw new ErrorDeNegocio("Esa vivienda no existe.");

    const limpio = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

    // Una hora mal escrita se le manda al huésped tal cual, y a esa hora está
    // en la puerta. Mejor no aceptarla que mandarla.
    const hora = (v: string | null, campo: string) => {
      if (v === null) return null;
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) {
        throw new ErrorDeNegocio(`«${v}» no es una hora. Escríbela como 16:00 (${campo}).`);
      }
      return v;
    };

    const codigo = limpio(data.codigoLlave);
    const cambioDeCodigo =
      codigo === null
        ? {} // en blanco: se queda como estaba
        : codigo === "-"
          ? { codigoLlaveCifrado: null }
          : { codigoLlaveCifrado: cifrar(codigo) };

    await prisma.property.update({
      where: { id: data.propertyId },
      data: {
        address: limpio(data.address),
        comoLlegar: limpio(data.comoLlegar),
        mapaUrl: limpio(data.mapaUrl),
        horaEntrada: hora(limpio(data.horaEntrada), "hora de entrada"),
        horaSalida: hora(limpio(data.horaSalida), "hora de salida"),
        wifiRed: limpio(data.wifiRed),
        wifiClave: limpio(data.wifiClave),
        normas: limpio(data.normas),
        ...cambioDeCodigo,
      },
    });

    revalidarVistasDeViviendas();
    revalidatePath(`/rental/properties/${data.propertyId}`);
  });
}

export async function createOwner(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const raw = Object.fromEntries(formData.entries());
    const data = ownerSchema.parse(raw);
    const creado = await prisma.owner.create({
      data: {
        organizationId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        taxId: data.taxId || null,
        address: data.address || null,
        monthlyFee: leerCuota(data.monthlyFee),
        monthlyFeeDesde: leerDia(data.monthlyFeeDesde),
        documentoLimpieza: data.documentoLimpieza ?? "FACTURA",
      },
    });
    // La cuota también nace como tramo: es el histórico el que manda al
    // liquidar, y un propietario cuya cuota solo viva en `monthlyFee` no se
    // cobraría.
    const cuota = leerCuota(data.monthlyFee);
    if (cuota !== null) {
      await prisma.cuotaFija.create({
        data: {
          ownerId: creado.id,
          importe: cuota,
          desde: leerDia(data.monthlyFeeDesde) ?? new Date(Date.UTC(2000, 0, 1, 12)),
          hasta: null,
        },
      });
    }
    revalidatePath("/rental/settings");
    revalidatePath("/rental/reports");
  });
}

/** Una fecha `aaaa-mm-dd` del formulario, a mediodía UTC. `null` si no viene. */
function leerDia(v: string | undefined): Date | null {
  const m = (v ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

const cuotaSchema = z.object({
  ownerId: z.string().min(1),
  importe: z.string().min(1),
  desde: z.string().min(1),
});

/**
 * Sube (o baja) la cuota de un propietario a partir de una fecha.
 *
 * No pisa el importe anterior: lo **cierra** el día antes y abre uno nuevo.
 * Esa es toda la gracia — a Academia Cañada se le cobró 400 €, luego 500 y
 * luego 600, y un informe de todo el año tiene que cobrar cada mes a su
 * precio.
 */
export async function guardarCuotaFija(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = cuotaSchema.parse(Object.fromEntries(formData.entries()));

    const importe = leerCuota(data.importe);
    if (importe === null || importe <= 0) {
      throw new ErrorDeNegocio("La cuota tiene que ser un importe mayor que cero.");
    }
    const desde = leerDia(data.desde);
    if (!desde) throw new ErrorDeNegocio("Hace falta desde cuándo se cobra.");

    const suyo = await prisma.owner.findFirst({
      where: { id: data.ownerId, organizationId },
      select: { id: true },
    });
    if (!suyo) throw new ErrorDeNegocio("Ese propietario no existe.");

    // El tramo anterior se cierra el día antes de que empiece el nuevo.
    const vispera = new Date(desde);
    vispera.setUTCDate(vispera.getUTCDate() - 1);
    await prisma.cuotaFija.updateMany({
      where: { ownerId: suyo.id, hasta: null, desde: { lt: desde } },
      data: { hasta: vispera },
    });

    await prisma.cuotaFija.create({
      data: { ownerId: suyo.id, importe, desde, hasta: null },
    });
    await prisma.owner.update({
      where: { id: suyo.id },
      data: { monthlyFee: importe, monthlyFeeDesde: desde },
    });

    revalidatePath("/rental/settings");
    revalidatePath("/rental/reports");
    revalidatePath("/rental/panel");
  });
}

export async function borrarCuotaFija(id: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const cuota = await prisma.cuotaFija.findFirst({
      where: { id, owner: { organizationId } },
      select: { id: true, ownerId: true },
    });
    if (!cuota) throw new ErrorDeNegocio("Esa cuota no existe.");
    await prisma.cuotaFija.delete({ where: { id: cuota.id } });

    // Lo que se enseña en la ficha vuelve a ser el tramo que quede abierto.
    const abierta = await prisma.cuotaFija.findFirst({
      where: { ownerId: cuota.ownerId, hasta: null },
      orderBy: { desde: "desc" },
    });
    await prisma.owner.update({
      where: { id: cuota.ownerId },
      data: {
        monthlyFee: abierta ? abierta.importe : null,
        monthlyFeeDesde: abierta ? abierta.desde : null,
      },
    });

    revalidatePath("/rental/settings");
    revalidatePath("/rental/reports");
    revalidatePath("/rental/panel");
  });
}

const employeeSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().optional(),
});

// El personal lo da de alta quien reparte el trabajo, no administración: son
// las limpiadoras, y quien las conoce es quien organiza las limpiezas.
export async function createEmployee(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.limpiezas");
    const raw = Object.fromEntries(formData.entries());
    const data = employeeSchema.parse(raw);
    await prisma.employee.create({
      data: {
        organizationId,
        name: data.name,
        role: data.role,
        phone: data.phone || null,
      },
    });
    revalidatePath("/rental/settings");
    revalidatePath("/rental/tasks");
  });
}

export async function setEmployeeActive(employeeId: string, active: boolean) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.limpiezas");
    await prisma.employee.updateMany({ where: { id: employeeId, organizationId }, data: { active } });
    revalidatePath("/rental/settings");
    revalidatePath("/rental/tasks");
  });
}

const grupoSchema = z.object({
  ownerId: z.string().min(1, "Falta el propietario"),
  name: z.string().min(1, "Falta el nombre del grupo"),
  managementPct: z.string().optional(),
});

/**
 * Un grupo de viviendas de un propietario, con su comisión de gestión.
 *
 * Inversiones Brito tiene dos y cobran distinto (30 % y 10 %). Poner el
 * porcentaje vivienda a vivienda obligaría a repetirlo once veces.
 */
export async function crearGrupo(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = grupoSchema.parse(Object.fromEntries(formData.entries()));

    const propietario = await prisma.owner.findFirst({
      where: { id: data.ownerId, organizationId },
      select: { id: true },
    });
    if (!propietario) throw new ErrorDeNegocio("Ese propietario no existe.");

    await prisma.propertyGroup.create({
      data: {
        organizationId,
        ownerId: propietario.id,
        name: data.name.trim(),
        managementPct: leerPorcentaje(data.managementPct),
      },
    });

    revalidarVistasDeViviendas();
  });
}

export async function cambiarComisionDeGrupo(groupId: string, porcentaje: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    await prisma.propertyGroup.updateMany({
      where: { id: groupId, organizationId },
      data: { managementPct: leerPorcentaje(porcentaje) },
    });
    revalidarVistasDeViviendas();
  });
}

export async function borrarGrupo(groupId: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");

    const cuantas = await prisma.property.count({ where: { groupId, organizationId } });
    if (cuantas > 0) {
      throw new ErrorDeNegocio(
        `Ese grupo todavía tiene ${cuantas} ${cuantas === 1 ? "vivienda" : "viviendas"}. Sácalas del grupo antes de borrarlo.`
      );
    }

    await prisma.propertyGroup.deleteMany({ where: { id: groupId, organizationId } });
    revalidarVistasDeViviendas();
  });
}

const envioSchema = z.object({
  ownerId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  medio: z.enum(["EMAIL", "MANO"]).default("EMAIL"),
  nota: z.string().optional(),
});

/**
 * Deja constancia de que a un propietario se le ha mandado su informe.
 *
 * Sin esto, «¿le mandamos ya el de septiembre?» solo se puede contestar
 * mirando la bandeja de enviados de un correo concreto, y solo lo sabe quien
 * lo mandó. La dirección se copia en el momento: si mañana cambia su correo,
 * lo que se mandó se mandó a la de entonces.
 */
export async function registrarEnvioDeInforme(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = envioSchema.parse(Object.fromEntries(formData.entries()));

    const owner = await prisma.owner.findFirst({
      where: { id: data.ownerId, organizationId },
      select: { id: true, email: true },
    });
    if (!owner) throw new ErrorDeNegocio("Ese propietario no existe.");

    await prisma.envioDeInforme.create({
      data: {
        ownerId: owner.id,
        periodStart: new Date(data.start),
        periodEnd: new Date(data.end),
        destinatario: owner.email,
        medio: data.medio,
        nota: data.nota?.trim() || null,
      },
    });

    revalidatePath("/rental/reports");
    revalidatePath("/cleaning/reports");
  });
}

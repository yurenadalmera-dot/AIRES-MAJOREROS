"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";


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
});

export async function createOwner(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const raw = Object.fromEntries(formData.entries());
    const data = ownerSchema.parse(raw);
    await prisma.owner.create({
      data: {
        organizationId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        taxId: data.taxId || null,
        address: data.address || null,
        monthlyFee: leerCuota(data.monthlyFee),
      },
    });
    revalidatePath("/rental/settings");
    revalidatePath("/rental/reports");
  });
}

const employeeSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().optional(),
});

export async function createEmployee(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
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
    const organizationId = await exigir("administracion");
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

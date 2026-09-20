"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles } from "@/lib/errores";
import { exigir } from "@/lib/auth";

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
        active: true,
      },
    });

    revalidatePath("/rental/properties");
    revalidatePath("/rental/settings");
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

    revalidatePath("/rental/properties");
    revalidatePath("/rental/settings");
    revalidatePath("/cleaning/tasks");
    revalidatePath("/cleaning");

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
    revalidatePath("/rental/properties");
    revalidatePath("/rental");
  });
}

export async function setPropertyActive(propertyId: string, active: boolean) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    await prisma.property.updateMany({ where: { id: propertyId, organizationId }, data: { active } });
    revalidatePath("/rental/properties");
    revalidatePath("/rental/settings");
  });
}

const ownerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
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

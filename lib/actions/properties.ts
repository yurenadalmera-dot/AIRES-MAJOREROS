"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("No autenticado");
  return session.organizationId;
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
});

export async function createProperty(formData: FormData) {
  const organizationId = await requireOrg();
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
}

export async function updateProperty(propertyId: string, formData: FormData) {
  await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = propertySchema.parse(raw);

  await prisma.property.update({
    where: { id: propertyId },
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

  revalidatePath("/rental/properties");
  revalidatePath("/rental/settings");
}

export async function setPropertyManualStatus(propertyId: string, status: string | null) {
  await requireOrg();
  await prisma.property.update({ where: { id: propertyId }, data: { manualStatus: status } });
  revalidatePath("/rental/properties");
  revalidatePath("/rental");
}

export async function setPropertyActive(propertyId: string, active: boolean) {
  await requireOrg();
  await prisma.property.update({ where: { id: propertyId }, data: { active } });
  revalidatePath("/rental/properties");
  revalidatePath("/rental/settings");
}

const ownerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export async function createOwner(formData: FormData) {
  const organizationId = await requireOrg();
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
}

const employeeSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().optional(),
});

export async function createEmployee(formData: FormData) {
  const organizationId = await requireOrg();
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
}

export async function setEmployeeActive(employeeId: string, active: boolean) {
  await requireOrg();
  await prisma.employee.update({ where: { id: employeeId }, data: { active } });
  revalidatePath("/rental/settings");
  revalidatePath("/rental/tasks");
}

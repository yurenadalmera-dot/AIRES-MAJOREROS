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

export async function assignEmployeeToTask(taskId: string, employeeId: string | null) {
  await requireOrg();
  await prisma.cleaningTask.update({
    where: { id: taskId },
    data: { employeeId: employeeId || null },
  });
  revalidatePath("/rental/tasks");
  revalidatePath("/rental");
  revalidatePath("/rental/properties");
  revalidatePath("/cleaning");
}

export async function updateTaskStatus(taskId: string, status: string) {
  await requireOrg();
  await prisma.cleaningTask.update({ where: { id: taskId }, data: { status } });
  revalidatePath("/rental/tasks");
  revalidatePath("/rental");
  revalidatePath("/rental/properties");
  revalidatePath("/cleaning");
}

const maintenanceSchema = z.object({
  propertyId: z.string().min(1),
  date: z.string().min(1),
  employeeId: z.string().optional(),
  notes: z.string().min(1),
});

export async function createMaintenanceTask(formData: FormData) {
  const organizationId = await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = maintenanceSchema.parse(raw);

  await prisma.cleaningTask.create({
    data: {
      organizationId,
      propertyId: data.propertyId,
      type: "MAINTENANCE",
      date: new Date(data.date),
      status: "PENDING",
      employeeId: data.employeeId || null,
      billable: false,
      price: 0,
      notes: data.notes,
    },
  });

  revalidatePath("/rental/tasks");
  revalidatePath("/rental");
  revalidatePath("/rental/properties");
}

export async function deleteTask(taskId: string) {
  await requireOrg();
  const task = await prisma.cleaningTask.findUnique({ where: { id: taskId } });
  if (task?.invoiceId) throw new Error("No se puede eliminar una tarea ya facturada");
  await prisma.cleaningTask.delete({ where: { id: taskId } });
  revalidatePath("/rental/tasks");
  revalidatePath("/rental");
  revalidatePath("/cleaning");
}

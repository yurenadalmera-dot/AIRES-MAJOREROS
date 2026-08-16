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

/**
 * Una tarea es un registro compartido: se consulta desde los paneles de los
 * dos negocios (tablero e informes en ambos, más facturación). Al cambiarla
 * hay que refrescar las rutas de ambos lados, no solo las del alquiler.
 */
function revalidateTaskViews() {
  revalidatePath("/rental");
  revalidatePath("/rental/tasks");
  revalidatePath("/rental/properties");
  revalidatePath("/rental/reports");
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/tasks");
  revalidatePath("/cleaning/reports");
  revalidatePath("/cleaning/invoices");
}

export async function assignEmployeeToTask(taskId: string, employeeId: string | null) {
  await requireOrg();
  await prisma.cleaningTask.update({
    where: { id: taskId },
    data: { employeeId: employeeId || null },
  });
  revalidateTaskViews();
}

export async function updateTaskStatus(taskId: string, status: string) {
  await requireOrg();
  await prisma.cleaningTask.update({ where: { id: taskId }, data: { status } });
  revalidateTaskViews();
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

  revalidateTaskViews();
}

export async function deleteTask(taskId: string) {
  await requireOrg();
  const task = await prisma.cleaningTask.findUnique({ where: { id: taskId } });
  if (task?.invoiceId) throw new Error("No se puede eliminar una tarea ya facturada");
  await prisma.cleaningTask.delete({ where: { id: taskId } });
  revalidateTaskViews();
}

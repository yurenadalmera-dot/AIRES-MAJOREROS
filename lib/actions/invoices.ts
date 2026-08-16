"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { splitAmount, round2 } from "@/lib/money";
import { format } from "date-fns";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("No autenticado");
  return session.organizationId;
}

const generateSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  billedToName: z.string().min(1),
  billedToTaxId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Genera una factura a partir de las tareas de limpieza YA hechas (DONE),
 * facturables y todavía sin asignar a ninguna factura, dentro del periodo.
 * Este es el punto donde el registro compartido "CleaningTask" pasa de ser
 * solo operativa de Emma a convertirse también en línea de factura de Aires
 * Majoreros — sin duplicar el dato, solo enlazándolo (invoiceId).
 */
export async function generateInvoice(formData: FormData) {
  const organizationId = await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = generateSchema.parse(raw);

  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);
  periodEnd.setHours(23, 59, 59, 999);

  const pendingTasks = await prisma.cleaningTask.findMany({
    where: {
      organizationId,
      type: "CLEANING",
      billable: true,
      status: "DONE",
      invoiceId: null,
      date: { gte: periodStart, lte: periodEnd },
    },
    include: { property: true },
    orderBy: { date: "asc" },
  });

  if (pendingTasks.length === 0) {
    throw new Error("No hay limpiezas pendientes de facturar en ese periodo");
  }

  const subtotal = round2(pendingTasks.reduce((sum, t) => sum + Number(t.price), 0));

  const splitConfig = await prisma.partnerSplitConfig.findFirst({
    where: { organizationId },
    orderBy: { effectiveFrom: "desc" },
  });
  const partnerAPercent = splitConfig ? Number(splitConfig.partnerAPercent) : 50;
  const partnerBPercent = splitConfig ? Number(splitConfig.partnerBPercent) : 50;
  const { partnerAAmount, partnerBAmount } = splitAmount(subtotal, partnerAPercent, partnerBPercent);

  const invoiceCountThisYear = await prisma.invoice.count({
    where: {
      organizationId,
      invoiceNumber: { startsWith: `AM-${format(new Date(), "yyyy")}-` },
    },
  });
  const invoiceNumber = `AM-${format(new Date(), "yyyy")}-${String(invoiceCountThisYear + 1).padStart(4, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      invoiceNumber,
      billedToName: data.billedToName,
      billedToTaxId: data.billedToTaxId || null,
      periodStart,
      periodEnd,
      status: "ISSUED",
      subtotal,
      total: subtotal,
      partnerAId: splitConfig?.partnerAId,
      partnerBId: splitConfig?.partnerBId,
      partnerAPercent,
      partnerBPercent,
      partnerAAmount,
      partnerBAmount,
      notes: data.notes || null,
    },
  });

  await prisma.invoiceLine.createMany({
    data: pendingTasks.map((t) => ({
      invoiceId: invoice.id,
      cleaningTaskId: t.id,
      description: t.type === "CLEANING" ? "Limpieza de salida" : "Servicio",
      propertyName: t.property.name,
      date: t.date,
      amount: t.price,
    })),
  });

  await prisma.cleaningTask.updateMany({
    where: { id: { in: pendingTasks.map((t) => t.id) } },
    data: { invoiceId: invoice.id },
  });

  revalidatePath("/cleaning");
  revalidatePath("/cleaning/invoices");

  return invoice.id;
}

export async function updateInvoiceStatus(invoiceId: string, status: string) {
  await requireOrg();
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  revalidatePath("/cleaning/invoices");
}

const splitSchema = z.object({
  partnerAId: z.string().min(1),
  partnerBId: z.string().min(1),
  partnerAPercent: z.coerce.number().min(0).max(100),
});

export async function updatePartnerSplit(formData: FormData) {
  const organizationId = await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = splitSchema.parse(raw);

  await prisma.partnerSplitConfig.create({
    data: {
      organizationId,
      partnerAId: data.partnerAId,
      partnerBId: data.partnerBId,
      partnerAPercent: data.partnerAPercent,
      partnerBPercent: round2(100 - data.partnerAPercent),
    },
  });

  revalidatePath("/cleaning/settings");
  revalidatePath("/cleaning");
}

const partnerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
});

export async function updatePartnerName(partnerId: string, formData: FormData) {
  await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = partnerSchema.parse(raw);
  await prisma.partner.update({
    where: { id: partnerId },
    data: { name: data.name, email: data.email || null },
  });
  revalidatePath("/cleaning/settings");
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/invoices");
}

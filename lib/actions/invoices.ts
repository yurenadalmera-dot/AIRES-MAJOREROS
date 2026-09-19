"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/auth";
import { splitAmount, round2 } from "@/lib/money";
import { format } from "date-fns";

const generateSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  billedToName: z.string().min(1),
  billedToTaxId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Siguiente número de factura del año, `AM-AAAA-NNNN`.
 *
 * Se deriva del número más alto ya emitido, no de cuántas facturas hay: si se
 * anula una, contar da un número que ya existe y, como `invoiceNumber` es
 * único, la siguiente factura no se puede emitir. Además la numeración debe
 * ser correlativa y no reutilizar números, aunque haya huecos por anulación.
 */
async function siguienteNumeroFactura(organizationId: string) {
  const prefijo = `AM-${format(new Date(), "yyyy")}-`;

  const ultima = await prisma.invoice.findFirst({
    where: { organizationId, invoiceNumber: { startsWith: prefijo } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  const ultimoOrdinal = ultima ? Number(ultima.invoiceNumber.slice(prefijo.length)) : 0;
  const siguiente = Number.isFinite(ultimoOrdinal) ? ultimoOrdinal + 1 : 1;

  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

/**
 * Genera una factura a partir de las tareas de limpieza YA hechas (DONE),
 * facturables y todavía sin asignar a ninguna factura, dentro del periodo.
 * Este es el punto donde el registro compartido "CleaningTask" pasa de ser
 * solo operativa de Emma a convertirse también en línea de factura de Aires
 * Majoreros — sin duplicar el dato, solo enlazándolo (invoiceId).
 */
export async function generateInvoice(formData: FormData) {
  const organizationId = await exigir("facturacion");
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

  const invoiceNumber = await siguienteNumeroFactura(organizationId);

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
  // Al facturar, las tareas pasan a mostrarse como "facturada" en el tablero,
  // que se consulta desde los dos negocios.
  revalidatePath("/cleaning/tasks");
  revalidatePath("/rental/tasks");

  return invoice.id;
}

export async function updateInvoiceStatus(invoiceId: string, status: string) {
  const organizationId = await exigir("facturacion");
  await prisma.invoice.updateMany({ where: { id: invoiceId, organizationId }, data: { status } });
  revalidatePath("/cleaning/invoices");
}

const splitSchema = z.object({
  partnerAId: z.string().min(1),
  partnerBId: z.string().min(1),
  partnerAPercent: z.coerce.number().min(0).max(100),
});

export async function updatePartnerSplit(formData: FormData) {
  const organizationId = await exigir("administracion");
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
  const organizationId = await exigir("administracion");
  const raw = Object.fromEntries(formData.entries());
  const data = partnerSchema.parse(raw);
  await prisma.partner.updateMany({
    where: { id: partnerId, organizationId },
    data: { name: data.name, email: data.email || null },
  });
  revalidatePath("/cleaning/settings");
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/invoices");
}

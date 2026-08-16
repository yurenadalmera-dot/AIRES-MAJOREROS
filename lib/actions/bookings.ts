"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateCommissions } from "@/lib/money";

const bookingSchema = z.object({
  propertyId: z.string().min(1),
  guestName: z.string().min(1),
  guestEmail: z.string().optional(),
  guestPhone: z.string().optional(),
  adults: z.coerce.number().int().min(1).default(1),
  children: z.coerce.number().int().min(0).default(0),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  channel: z.string().min(1),
  totalPrice: z.coerce.number().min(0),
  platformCommissionPct: z.coerce.number().min(0).max(100),
  bankCommissionPct: z.coerce.number().min(0).max(100),
  notes: z.string().optional(),
});

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("No autenticado");
  return session.organizationId;
}

export async function createBooking(formData: FormData) {
  const organizationId = await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = bookingSchema.parse(raw);

  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);
  if (checkOut <= checkIn) {
    throw new Error("La fecha de salida debe ser posterior a la de entrada");
  }

  const { platformCommissionAmt, bankCommissionAmt, netAmount } = calculateCommissions({
    totalPrice: data.totalPrice,
    platformCommissionPct: data.platformCommissionPct,
    bankCommissionPct: data.bankCommissionPct,
  });

  const booking = await prisma.booking.create({
    data: {
      organizationId,
      propertyId: data.propertyId,
      guestName: data.guestName,
      guestEmail: data.guestEmail || null,
      guestPhone: data.guestPhone || null,
      adults: data.adults,
      children: data.children,
      checkIn,
      checkOut,
      channel: data.channel,
      totalPrice: data.totalPrice,
      platformCommissionPct: data.platformCommissionPct,
      platformCommissionAmt,
      bankCommissionPct: data.bankCommissionPct,
      bankCommissionAmt,
      netAmount,
      notes: data.notes || null,
      source: "MANUAL",
    },
  });

  // La limpieza de salida se genera automáticamente, igual que ocurre en el
  // flujo de sincronización con Lodgify.
  const property = await prisma.property.findUnique({ where: { id: data.propertyId } });
  await prisma.cleaningTask.create({
    data: {
      organizationId,
      propertyId: data.propertyId,
      bookingId: booking.id,
      type: "CLEANING",
      date: checkOut,
      status: "PENDING",
      billable: true,
      price: property?.cleaningPrice ?? 0,
    },
  });

  revalidatePath("/rental");
  revalidatePath("/rental/bookings");
  revalidatePath("/rental/calendar");
  revalidatePath("/rental/tasks");
  revalidatePath("/cleaning/tasks");
  revalidatePath("/rental/properties");
}

export async function updateBooking(bookingId: string, formData: FormData) {
  await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = bookingSchema.parse(raw);

  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);
  if (checkOut <= checkIn) {
    throw new Error("La fecha de salida debe ser posterior a la de entrada");
  }

  const { platformCommissionAmt, bankCommissionAmt, netAmount } = calculateCommissions({
    totalPrice: data.totalPrice,
    platformCommissionPct: data.platformCommissionPct,
    bankCommissionPct: data.bankCommissionPct,
  });

  const existing = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!existing) throw new Error("Reserva no encontrada");

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      propertyId: data.propertyId,
      guestName: data.guestName,
      guestEmail: data.guestEmail || null,
      guestPhone: data.guestPhone || null,
      adults: data.adults,
      children: data.children,
      checkIn,
      checkOut,
      channel: data.channel,
      totalPrice: data.totalPrice,
      platformCommissionPct: data.platformCommissionPct,
      platformCommissionAmt,
      bankCommissionPct: data.bankCommissionPct,
      bankCommissionAmt,
      netAmount,
      notes: data.notes || null,
      // Cualquier edición manual de una reserva sincronizada la protege de
      // que el próximo sync de Lodgify la sobrescriba.
      manuallyAdjusted: existing.source === "LODGIFY" ? true : existing.manuallyAdjusted,
    },
  });

  // Mantener la fecha de la tarea de limpieza asociada a la salida, si existe.
  await prisma.cleaningTask.updateMany({
    where: { bookingId, type: "CLEANING" },
    data: { date: checkOut, propertyId: data.propertyId },
  });

  revalidatePath("/rental");
  revalidatePath("/rental/bookings");
  revalidatePath("/rental/calendar");
  revalidatePath("/rental/tasks");
  revalidatePath("/cleaning/tasks");
  revalidatePath("/rental/properties");
}

export async function setBookingManualLock(bookingId: string, locked: boolean) {
  await requireOrg();
  await prisma.booking.update({ where: { id: bookingId }, data: { manuallyAdjusted: locked } });
  revalidatePath("/rental/bookings");
}

export async function deleteBooking(bookingId: string) {
  await requireOrg();
  await prisma.cleaningTask.deleteMany({ where: { bookingId, invoiceId: null } });
  await prisma.booking.delete({ where: { id: bookingId } });
  revalidatePath("/rental");
  revalidatePath("/rental/bookings");
  revalidatePath("/rental/calendar");
  revalidatePath("/rental/tasks");
  revalidatePath("/cleaning/tasks");
}

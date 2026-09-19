"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/auth";
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

/**
 * Comprueba que la vivienda es de esta organización y devuelve sus datos.
 *
 * El `propertyId` llega del formulario, así que sin esto una cuenta podría
 * colgar una reserva de la vivienda de otra empresa.
 */
async function viviendaDeLaOrganizacion(propertyId: string, organizationId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
  if (!property) throw new Error("La vivienda indicada no existe");
  return property;
}

/**
 * Impide solapar dos reservas confirmadas en la misma vivienda.
 *
 * Las fechas se tratan como intervalo semiabierto: la salida de una puede ser
 * la entrada de la siguiente, que es lo normal en alquiler vacacional. Se
 * solapan cuando `entrada < salidaExistente` y `entradaExistente < salida`.
 *
 * `excluirId` sirve al editar, para no chocar consigo misma.
 */
async function comprobarQueNoSeSolapa(
  organizationId: string,
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  excluirId?: string
) {
  const choque = await prisma.booking.findFirst({
    where: {
      organizationId,
      propertyId,
      status: "CONFIRMED",
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    orderBy: { checkIn: "asc" },
  });

  if (choque) {
    const f = (d: Date) => d.toLocaleDateString("es-ES");
    throw new Error(
      `Esa vivienda ya está reservada del ${f(choque.checkIn)} al ${f(choque.checkOut)} ` +
        `a nombre de ${choque.guestName}.`
    );
  }
}

export async function createBooking(formData: FormData) {
  const organizationId = await exigir("operativa.alquiler");
  const raw = Object.fromEntries(formData.entries());
  const data = bookingSchema.parse(raw);

  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);
  if (checkOut <= checkIn) {
    throw new Error("La fecha de salida debe ser posterior a la de entrada");
  }

  const property = await viviendaDeLaOrganizacion(data.propertyId, organizationId);
  await comprobarQueNoSeSolapa(organizationId, property.id, checkIn, checkOut);

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
  const organizationId = await exigir("operativa.alquiler");
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

  // Filtrar también por organización: el id viene del cliente, y sin ese
  // filtro una cuenta podría editar la reserva de otra empresa.
  const existing = await prisma.booking.findFirst({ where: { id: bookingId, organizationId } });
  if (!existing) throw new Error("Reserva no encontrada");

  await viviendaDeLaOrganizacion(data.propertyId, organizationId);
  await comprobarQueNoSeSolapa(organizationId, data.propertyId, checkIn, checkOut, bookingId);

  await prisma.booking.updateMany({
    where: { id: bookingId, organizationId },
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
    where: { bookingId, organizationId, type: "CLEANING" },
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
  const organizationId = await exigir("operativa.alquiler");
  await prisma.booking.updateMany({
    where: { id: bookingId, organizationId },
    data: { manuallyAdjusted: locked },
  });
  revalidatePath("/rental/bookings");
}

export async function deleteBooking(bookingId: string) {
  const organizationId = await exigir("operativa.alquiler");
  await prisma.cleaningTask.deleteMany({ where: { bookingId, organizationId, invoiceId: null } });
  await prisma.booking.deleteMany({ where: { id: bookingId, organizationId } });
  revalidatePath("/rental");
  revalidatePath("/rental/bookings");
  revalidatePath("/rental/calendar");
  revalidatePath("/rental/tasks");
  revalidatePath("/cleaning/tasks");
}

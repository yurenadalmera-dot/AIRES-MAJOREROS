"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { fetchAllLodgifyReservations, onlyConfirmed, isLodgifyLiveMode } from "@/lib/lodgify";
import { calculateCommissions } from "@/lib/money";

export interface SyncSummary {
  liveMode: boolean;
  fetched: number;
  confirmed: number;
  created: number;
  updated: number;
  skippedManuallyAdjusted: number;
  unmatchedProperty: number;
  unmatchedDetails: string[];
}

/**
 * Sincroniza reservas desde Lodgify:
 *  1) recorre todas las páginas,
 *  2) se queda solo con las confirmadas (Booked), descarta Declined/Cancelled/Tentative,
 *  3) empareja property_id con la vivienda por lodgifyPropertyId,
 *  4) crea o actualiza por lodgifyBookingId (clave única) sin duplicar,
 *  5) si la reserva ya existe y fue ajustada manualmente, la deja intacta,
 *  6) calcula comisión de plataforma y bancaria aplicando los % configurados
 *     sobre el precio total, porque Lodgify no los desglosa.
 */
export async function syncLodgifyReservations(): Promise<SyncSummary> {
  const session = await getSession();
  if (!session) throw new Error("No autenticado");
  const organizationId = session.organizationId;

  const settings = await prisma.integrationSettings.findUnique({
    where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
  });
  const platformPct = settings ? Number(settings.defaultPlatformPct) : 15;
  const bankPct = settings ? Number(settings.defaultBankPct) : 2.5;

  const all = await fetchAllLodgifyReservations();
  const confirmed = onlyConfirmed(all);

  const properties = await prisma.property.findMany({
    where: { organizationId, lodgifyPropertyId: { not: null } },
  });
  const propertyByExternalId = new Map(properties.map((p) => [p.lodgifyPropertyId as string, p]));

  let created = 0;
  let updated = 0;
  let skippedManuallyAdjusted = 0;
  let unmatchedProperty = 0;
  const unmatchedDetails: string[] = [];

  for (const res of confirmed) {
    const property = propertyByExternalId.get(res.propertyExternalId);
    if (!property) {
      unmatchedProperty++;
      unmatchedDetails.push(`${res.externalId} (property_id ${res.propertyExternalId} sin emparejar)`);
      continue;
    }

    const existing = await prisma.booking.findUnique({
      where: { lodgifyBookingId: res.externalId },
    });

    if (existing) {
      if (existing.manuallyAdjusted) {
        skippedManuallyAdjusted++;
        continue;
      }
      const { platformCommissionAmt, bankCommissionAmt, netAmount } = calculateCommissions({
        totalPrice: res.totalPrice,
        platformCommissionPct: platformPct,
        bankCommissionPct: bankPct,
      });
      await prisma.booking.update({
        where: { id: existing.id },
        data: {
          propertyId: property.id,
          guestName: res.guestName,
          adults: res.adults,
          children: res.children,
          checkIn: res.checkIn,
          checkOut: res.checkOut,
          channel: res.channel,
          totalPrice: res.totalPrice,
          platformCommissionPct: platformPct,
          platformCommissionAmt,
          bankCommissionPct: bankPct,
          bankCommissionAmt,
          netAmount,
          status: "CONFIRMED",
          source: "LODGIFY",
        },
      });
      await prisma.cleaningTask.updateMany({
        where: { bookingId: existing.id, type: "CLEANING", invoiceId: null },
        data: { date: res.checkOut, propertyId: property.id },
      });
      updated++;
    } else {
      const { platformCommissionAmt, bankCommissionAmt, netAmount } = calculateCommissions({
        totalPrice: res.totalPrice,
        platformCommissionPct: platformPct,
        bankCommissionPct: bankPct,
      });
      const booking = await prisma.booking.create({
        data: {
          organizationId,
          propertyId: property.id,
          lodgifyBookingId: res.externalId,
          guestName: res.guestName,
          adults: res.adults,
          children: res.children,
          checkIn: res.checkIn,
          checkOut: res.checkOut,
          channel: res.channel,
          status: "CONFIRMED",
          totalPrice: res.totalPrice,
          platformCommissionPct: platformPct,
          platformCommissionAmt,
          bankCommissionPct: bankPct,
          bankCommissionAmt,
          netAmount,
          source: "LODGIFY",
        },
      });
      await prisma.cleaningTask.create({
        data: {
          organizationId,
          propertyId: property.id,
          bookingId: booking.id,
          type: "CLEANING",
          date: res.checkOut,
          status: "PENDING",
          billable: true,
          price: property.cleaningPrice,
        },
      });
      created++;
    }
  }

  const summary: SyncSummary = {
    liveMode: isLodgifyLiveMode(),
    fetched: all.length,
    confirmed: confirmed.length,
    created,
    updated,
    skippedManuallyAdjusted,
    unmatchedProperty,
    unmatchedDetails,
  };

  await prisma.integrationSettings.upsert({
    where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    update: {
      lastSyncAt: new Date(),
      lastSyncSummary: JSON.stringify(summary),
    },
    create: {
      organizationId,
      provider: "LODGIFY",
      lastSyncAt: new Date(),
      lastSyncSummary: JSON.stringify(summary),
    },
  });

  revalidatePath("/rental");
  revalidatePath("/rental/bookings");
  revalidatePath("/rental/calendar");
  revalidatePath("/rental/tasks");
  revalidatePath("/rental/properties");
  revalidatePath("/rental/settings");
  // El sync crea limpiezas de salida, visibles también desde el panel de limpiezas.
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/tasks");

  return summary;
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { fetchAllLodgifyReservations, onlyConfirmed, isLodgifyLiveMode } from "@/lib/lodgify";
import { calculateCommissions } from "@/lib/money";

export interface SyncSummary {
  liveMode: boolean;
  fetched: number;
  confirmed: number;
  created: number;
  updated: number;
  /** Reservas que estaban confirmadas y ya no lo están en Lodgify. */
  cancelled: number;
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
export async function syncLodgifyReservations(): Promise<SyncSummary | { error: string }> {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");

    const settings = await prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    });
    const platformPct = settings ? Number(settings.defaultPlatformPct) : 15;
    const bankPct = settings ? Number(settings.defaultBankPct) : 2.5;

    const all = await fetchAllLodgifyReservations();
    const confirmed = onlyConfirmed(all);

    let created = 0;
    let updated = 0;
    let skippedManuallyAdjusted = 0;

    // Las reservas que ya NO están confirmadas (anuladas o rechazadas en
    // Lodgify) hay que reflejarlas: antes se descartaban sin más, así que una
    // reserva anulada se quedaba como CONFIRMED con su limpieza pendiente. Se
    // mandaba a alguien a limpiar un apartamento vacío y se facturaba.
    let cancelled = 0;
    const idsConfirmados = new Set(confirmed.map((r) => r.externalId));
    for (const res of all) {
      if (idsConfirmados.has(res.externalId)) continue;

      const existente = await prisma.booking.findFirst({
        where: { lodgifyBookingId: res.externalId, organizationId, status: "CONFIRMED" },
      });
      if (!existente) continue;
      // Una reserva tocada a mano no se toca, igual que en la actualización.
      if (existente.manuallyAdjusted) {
        skippedManuallyAdjusted++;
        continue;
      }

      await prisma.booking.updateMany({
        where: { id: existente.id, organizationId },
        data: { status: "CANCELLED" },
      });
      // Su limpieza se cancela, salvo que ya esté facturada o hecha: eso ya
      // ocurrió y no se puede deshacer desde aquí.
      await prisma.cleaningTask.updateMany({
        where: {
          bookingId: existente.id,
          organizationId,
          type: "CLEANING",
          invoiceId: null,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "CANCELLED" },
      });
      cancelled++;
    }

    const properties = await prisma.property.findMany({
      where: { organizationId, lodgifyPropertyId: { not: null } },
    });
    const propertyByExternalId = new Map(properties.map((p) => [p.lodgifyPropertyId as string, p]));

    let unmatchedProperty = 0;
    const unmatchedDetails: string[] = [];

    for (const res of confirmed) {
      const property = propertyByExternalId.get(res.propertyExternalId);
      if (!property) {
        unmatchedProperty++;
        unmatchedDetails.push(`${res.externalId} (property_id ${res.propertyExternalId} sin emparejar)`);
        continue;
      }

      // `lodgifyBookingId` es único en toda la tabla, así que hay que acotar por
      // organización: sin ello, el sync de una cuenta podría sobrescribir la
      // reserva de otra que usara el mismo identificador de Lodgify.
      const existing = await prisma.booking.findFirst({
        where: { lodgifyBookingId: res.externalId, organizationId },
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
        await prisma.booking.updateMany({
          where: { id: existing.id, organizationId },
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
      cancelled,
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
  });
}

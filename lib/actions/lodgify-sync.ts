"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import {
  fetchAllLodgifyReservations,
  fetchAllLodgifyProperties,
  onlyConfirmed,
  claveLodgify,
} from "@/lib/lodgify";
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
  /** Viviendas dadas de alta desde Lodgify en esta sincronización. */
  propertiesCreated: number;
  /** Viviendas que ya existían y se han refrescado. */
  propertiesUpdated: number;
  /** Limpiezas de reservas ya terminadas, dadas por hechas al importarlas. */
  pastCleaningsDone: number;
}

/**
 * Da de alta en el sistema las viviendas que hay en Lodgify.
 *
 * Lo que manda es `lodgifyPropertyId`: por ahí se reconoce una vivienda ya
 * conocida, así que sincronizar dos veces no duplica nada.
 *
 * De una vivienda que ya existe solo se refrescan los datos que vienen de
 * Lodgify (nombre, localidad, dirección, capacidad, habitaciones, baños). El
 * precio de limpieza, el propietario y el estado manual **no se tocan**: son
 * cosa de aquí, Lodgify no sabe nada de ellos y sobrescribirlos borraría el
 * trabajo de quien los puso.
 */
async function sincronizarViviendas(organizationId: string, apiKey: string | null) {
  const viviendas = await fetchAllLodgifyProperties(apiKey);

  let propertiesCreated = 0;
  let propertiesUpdated = 0;

  for (const v of viviendas) {
    const existente = await prisma.property.findUnique({
      where: { lodgifyPropertyId: v.externalId },
      select: { id: true, organizationId: true },
    });

    // Una vivienda con ese identificador pero de otra organización no es
    // nuestra: no se toca.
    if (existente && existente.organizationId !== organizationId) continue;

    if (existente) {
      await prisma.property.update({
        where: { id: existente.id },
        data: {
          name: v.name,
          locality: v.locality,
          address: v.address,
          capacity: v.capacity,
          bedrooms: v.bedrooms,
          bathrooms: v.bathrooms,
          active: v.active,
        },
      });
      propertiesUpdated++;
    } else {
      await prisma.property.create({
        data: {
          organizationId,
          lodgifyPropertyId: v.externalId,
          name: v.name,
          locality: v.locality,
          address: v.address,
          capacity: v.capacity,
          bedrooms: v.bedrooms,
          bathrooms: v.bathrooms,
          active: v.active,
          // Sin propietario y sin precio de limpieza: se ponen aquí, a mano.
          cleaningPrice: 0,
        },
      });
      propertiesCreated++;
    }
  }

  return { propertiesCreated, propertiesUpdated };
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

    const apiKey = await claveLodgify(organizationId);

    // Primero las viviendas, después las reservas. El orden no es un detalle:
    // una reserva solo entra si su vivienda existe, así que traerlas al revés
    // dejaba fuera todas las reservas de casas todavía no dadas de alta —que
    // es exactamente la situación de una instalación recién vaciada.
    const { propertiesCreated, propertiesUpdated } = await sincronizarViviendas(
      organizationId,
      apiKey
    );

    const all = await fetchAllLodgifyReservations(apiKey);
    const confirmed = onlyConfirmed(all);

    let created = 0;
    let updated = 0;
    let skippedManuallyAdjusted = 0;
    let pastCleaningsDone = 0;

    // Una reserva que ya terminó trae una limpieza que ya se hizo.
    //
    // Importar un año de historial creaba cientos de limpiezas «pendientes»
    // con fecha de enero, febrero, marzo… Ninguna estaba pendiente de verdad:
    // la casa se limpió en su día. Dejarlas así llena la pantalla de trabajo
    // atrasado que no existe y descuadra cualquier recuento.
    //
    // El corte es el final del día de hoy: lo de mañana en adelante sí está
    // pendiente.
    const finDeHoy = new Date();
    finDeHoy.setHours(23, 59, 59, 999);

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
        // Se listan unas cuantas, no todas: el contador ya dice cuántas son, y
        // este resumen se guarda en la base de datos.
        if (unmatchedDetails.length < 20) {
          unmatchedDetails.push(
            `${res.externalId} (property_id ${res.propertyExternalId} sin emparejar)`
          );
        }
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
        const yaPasó = res.checkOut <= finDeHoy;
        if (yaPasó) pastCleaningsDone++;

        await prisma.cleaningTask.create({
          data: {
            organizationId,
            propertyId: property.id,
            bookingId: booking.id,
            type: "CLEANING",
            date: res.checkOut,
            status: yaPasó ? "DONE" : "PENDING",
            billable: true,
            price: property.cleaningPrice,
          },
        });
        created++;
      }
    }

    const summary: SyncSummary = {
      liveMode: apiKey !== null,
      fetched: all.length,
      confirmed: confirmed.length,
      created,
      updated,
      cancelled,
      skippedManuallyAdjusted,
      unmatchedProperty,
      unmatchedDetails,
      propertiesCreated,
      propertiesUpdated,
      pastCleaningsDone,
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

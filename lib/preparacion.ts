/**
 * Qué hay que llevar a cada limpieza.
 *
 * Quien limpia necesita saber **para cuánta gente** prepara la casa: sábanas,
 * toallas y amenities se cuentan por personas y por camas, no por metros. Ese
 * dato existía —está en la reserva— pero se quedaba del lado del alquiler, así
 * que se preguntaba por WhatsApp o se llevaba de más por si acaso.
 *
 * Ojo a la distinción, que no es un detalle:
 *
 * - **Los huéspedes que salen** son con los que se cobra la limpieza. Van
 *   congelados en la tarea (`CleaningTask.huespedes`) desde que se creó,
 *   porque una factura no puede cambiar sola.
 * - **Los huéspedes que entran** son para los que se prepara la casa. Estos se
 *   miran cada vez: si mañana cambia la reserva siguiente, lo que hay que
 *   llevar cambia con ella.
 *
 * Confundirlos hace que se preparen cuatro camas para una pareja, o al revés.
 */

import { differenceInCalendarDays, startOfDay } from "date-fns";
import { prisma } from "./prisma";

export interface QuienEntra {
  nombre: string;
  fecha: Date;
  adultos: number;
  ninos: number;
  total: number;
}

export interface QueLlevar {
  taskId: string;
  fecha: Date;
  estado: string;
  vivienda: {
    id: string;
    nombre: string;
    capacidad: number;
    habitaciones: number;
    banos: number;
    direccion: string | null;
  };
  /** salida | repaso, o `null` si la tarea es anterior a que esto se guardara. */
  servicio: string | null;
  /** Con cuántos se cobra: los de quien se fue. */
  huespedesQueSalen: number | null;
  /** Para cuántos se prepara. `null` si después no entra nadie. */
  entra: QuienEntra | null;
  /** Días entre la limpieza y la entrada siguiente. */
  diasHastaLaEntrada: number | null;
  /**
   * Entran el mismo día que se limpia. No hay margen: si esa limpieza se
   * retrasa, hay alguien esperando en la puerta.
   */
  entraElMismoDia: boolean;
}

/**
 * Las limpiezas de un periodo con lo que hace falta para prepararlas.
 *
 * Las canceladas no salen: no se hacen, así que no hay nada que llevar.
 */
export async function queLlevarEnLasLimpiezas({
  organizationId,
  desde,
  hasta,
}: {
  organizationId: string;
  desde: Date;
  hasta: Date;
}): Promise<QueLlevar[]> {
  const inicio = startOfDay(desde);
  const fin = new Date(hasta);
  fin.setHours(23, 59, 59, 999);

  const tareas = await prisma.cleaningTask.findMany({
    where: {
      organizationId,
      type: "CLEANING",
      status: { not: "CANCELLED" },
      date: { gte: inicio, lte: fin },
    },
    include: { property: true },
    orderBy: [{ date: "asc" }, { property: { name: "asc" } }],
  });
  if (tareas.length === 0) return [];

  // Las entradas de esas mismas viviendas, para saber quién viene detrás. Se
  // piden todas de una vez: una consulta por limpieza convertiría una semana
  // cargada en cuarenta viajes a la base.
  const viviendas = [...new Set(tareas.map((t) => t.propertyId))];
  const ultimaFecha = tareas[tareas.length - 1].date;
  const entradas = await prisma.booking.findMany({
    where: {
      organizationId,
      propertyId: { in: viviendas },
      status: "CONFIRMED",
      checkIn: { gte: inicio, lte: new Date(ultimaFecha.getTime() + 60 * 86400000) },
    },
    select: { propertyId: true, checkIn: true, adults: true, children: true, guestName: true },
    orderBy: { checkIn: "asc" },
  });

  const porVivienda = new Map<string, typeof entradas>();
  for (const e of entradas) {
    const lista = porVivienda.get(e.propertyId) ?? [];
    lista.push(e);
    porVivienda.set(e.propertyId, lista);
  }

  return tareas.map((t) => {
    const dia = startOfDay(t.date);
    // La primera entrada que empieza el día de la limpieza o después. La
    // lista ya viene ordenada, así que la primera que encaja es la buena.
    const siguiente =
      (porVivienda.get(t.propertyId) ?? []).find((e) => startOfDay(e.checkIn) >= dia) ?? null;

    const entra: QuienEntra | null = siguiente
      ? {
          nombre: siguiente.guestName,
          fecha: siguiente.checkIn,
          adultos: siguiente.adults,
          ninos: siguiente.children,
          total: siguiente.adults + siguiente.children,
        }
      : null;

    const dias = entra ? differenceInCalendarDays(startOfDay(entra.fecha), dia) : null;

    return {
      taskId: t.id,
      fecha: t.date,
      estado: t.status,
      vivienda: {
        id: t.property.id,
        nombre: t.property.name,
        capacidad: t.property.capacity,
        habitaciones: t.property.bedrooms,
        banos: t.property.bathrooms,
        direccion: t.property.address,
      },
      servicio: t.servicio,
      huespedesQueSalen: t.huespedes,
      entra,
      diasHastaLaEntrada: dias,
      entraElMismoDia: dias === 0,
    };
  });
}

/** Una línea corta con lo que hay que preparar, para la pantalla y el tablero. */
export function resumenDeLoQueLlevar(q: QueLlevar): string {
  if (!q.entra) return "Después no entra nadie";
  const partes: string[] = [];
  partes.push(q.entra.adultos === 1 ? "1 adulto" : `${q.entra.adultos} adultos`);
  if (q.entra.ninos > 0) partes.push(q.entra.ninos === 1 ? "1 niño" : `${q.entra.ninos} niños`);
  return `Entran ${partes.join(" y ")}`;
}

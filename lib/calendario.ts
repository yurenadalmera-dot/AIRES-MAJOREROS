// Qué pintar en cada casilla del calendario semanal.
//
// Aparte de la vista para poder probarlo: aquí se decidió mal una vez y no se
// notó. El día de salida quedaba fuera del rango pintado, así que salía como
// casilla vacía y la etiqueta «Salida» no llegaba a verse nunca — justo el día
// en que hay que mandar a alguien a limpiar.

import { isSameDay, startOfDay } from "date-fns";

export interface ReservaEnCalendario {
  guestName: string;
  checkIn: Date;
  checkOut: Date;
}

export interface Casilla<R extends ReservaEnCalendario> {
  /** La reserva que manda en esa casilla, o null si el día está libre. */
  reserva: R | null;
  esEntrada: boolean;
  esSalida: boolean;
  /** Se va uno y no entra nadie: el día queda libre pero hay que limpiar. */
  soloSalida: boolean;
  etiqueta: string;
}

/**
 * El huésped ocupa desde la entrada hasta la víspera de la salida. El día de
 * la salida se pinta igualmente, porque es cuando toca limpiar.
 *
 * Si ese día se va uno y entra otro, manda quien entra —es quien ocupa la casa
 * esa noche— pero se señala igual que hay salida, que es lo que obliga a
 * limpiar entre medias.
 */
export function casillaDelDia<R extends ReservaEnCalendario>(
  reservas: R[],
  dia: Date
): Casilla<R> {
  const inicioDia = startOfDay(dia);

  const queOcupa = reservas.find(
    (b) => inicioDia >= startOfDay(b.checkIn) && inicioDia < startOfDay(b.checkOut)
  );
  const queSeVa = reservas.find((b) => isSameDay(b.checkOut, dia));

  const reserva = queOcupa ?? queSeVa ?? null;
  const esEntrada = !!queOcupa && isSameDay(queOcupa.checkIn, dia);
  const esSalida = !!queSeVa;
  const soloSalida = !queOcupa && !!queSeVa;

  const etiqueta = !reserva
    ? ""
    : esEntrada && esSalida
      ? "Salida y entrada · limpieza"
      : esEntrada
        ? "Entrada"
        : soloSalida
          ? "Salida · limpieza"
          : "—";

  return { reserva, esEntrada, esSalida, soloSalida, etiqueta };
}

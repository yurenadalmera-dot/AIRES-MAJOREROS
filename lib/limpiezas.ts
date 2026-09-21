/**
 * Qué limpieza toca después de cada salida.
 *
 * La regla no me la he inventado: está en el workflow «Generar limpiezas» de
 * n8n, que es el que viene generándolas de verdad desde agosto. Aquí se copia
 * tal cual, para poder apagar aquel y que no cambie nada de lo que se cobra.
 *
 * Dice así: por cada salida se apunta una limpieza. Se busca la **siguiente
 * entrada** de esa misma vivienda (la primera que empiece en la fecha de la
 * salida o después). Si entre una y otra pasan **siete días o más**, la
 * limpieza es un **repaso**; si no, es una **salida**.
 *
 * Que un hueco largo dé la limpieza más barata sorprende hasta que se piensa:
 * la casa se queda cerrada y lo que hace falta antes de que entre el siguiente
 * es un repaso, no la limpieza a fondo de una salida encadenada.
 *
 * El número de huéspedes con el que se cobra es el de **quien se va**, no el
 * de quien entra. También es lo que hace n8n, y es lo que sale impreso en la
 * factura: «Limpieza de salida (4 huéspedes)».
 */

import type { Servicio } from "./tarifas";

/** Días de hueco a partir de los cuales la limpieza es un repaso. */
export const DIAS_PARA_REPASO = 7;

const UN_DIA = 86_400_000;

/** Solo la fecha, en UTC: las horas aquí no pintan nada y estorban al restar. */
function soloDia(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

export interface ReservaParaLimpieza {
  checkIn: Date;
  checkOut: Date;
}

/**
 * La siguiente entrada en esa vivienda a partir de una salida, o `null` si no
 * hay ninguna. Se ignora la propia reserva que se va.
 */
export function siguienteEntrada<R extends ReservaParaLimpieza>(
  reservas: R[],
  salida: Date,
  excluir?: R
): R | null {
  const diaSalida = soloDia(salida);
  let mejor: R | null = null;
  for (const r of reservas) {
    if (excluir && r === excluir) continue;
    const entrada = soloDia(r.checkIn);
    if (entrada < diaSalida) continue;
    if (!mejor || entrada < soloDia(mejor.checkIn)) mejor = r;
  }
  return mejor;
}

/**
 * Salida o repaso, según lo que tarde en entrar el siguiente.
 *
 * Sin siguiente entrada conocida se queda en «salida»: es la limpieza que
 * siempre toca, y la más cara de las dos. Suponer un repaso porque todavía no
 * hay nadie apuntado sería cobrar de menos por una casa que quizá se alquila
 * la semana que viene.
 */
export function servicioDeLaSalida(salida: Date, entradaSiguiente: Date | null): Servicio {
  if (!entradaSiguiente) return "salida";
  const hueco = (soloDia(entradaSiguiente) - soloDia(salida)) / UN_DIA;
  return hueco >= DIAS_PARA_REPASO ? "repaso" : "salida";
}

/** Cuántos huéspedes trae una reserva. Es con lo que se cobra la limpieza. */
export function huespedesDe(reserva: { adults: number; children: number }): number {
  return (reserva.adults ?? 0) + (reserva.children ?? 0);
}

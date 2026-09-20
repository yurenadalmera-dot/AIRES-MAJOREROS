/**
 * Cuánto cuesta una limpieza.
 *
 * Aquí el precio era uno fijo por vivienda. En Mirador —que es donde están
 * los datos reales— es **base más tanto por huésped adicional**, y eso no es
 * un detalle: una salida de cuatro huéspedes cuesta 80 € donde una de dos
 * cuesta 60. Con un precio fijo, todas las de cuatro se facturaban de menos.
 *
 * Tres piezas, de lo particular a lo general:
 *
 *   1. **Precio cerrado de la vivienda.** Villa Mónica son 120 € y da igual
 *      cuántos vengan: es una casa de quince plazas y se limpia entera.
 *   2. **La línea de la tarifa** del propietario, por servicio (salida o
 *      repaso): una base con unos huéspedes incluidos, y un suplemento por
 *      cada uno que pase de ahí.
 *   3. Si no hay ni lo uno ni lo otro, no hay precio y hay que ponerlo a
 *      mano — mejor que inventarse uno.
 *
 * Los números de verdad, de julio de 2026: la tarifa «Oficial 2026» cobra 60 €
 * de salida con dos huéspedes incluidos y 10 € por cada adicional, así que la
 * del Apto 24 con cuatro huéspedes salió a 80 €. Está en las pruebas.
 */

import { round2 } from "./money";

export type Servicio = "salida" | "repaso";

export interface LineaDeTarifa {
  servicio: Servicio;
  /** Lo que cuesta hasta `huespedesIncluidos`. */
  base: number;
  huespedesIncluidos: number;
  /** Lo que se suma por cada huésped que pase de los incluidos. */
  porHuespedAdicional: number;
}

export interface PrecioDeLimpieza {
  /** `null` cuando no hay forma de saberlo: hay que ponerlo a mano. */
  precio: number | null;
  /** Cómo ha salido, para poder enseñarlo y discutirlo. */
  explicacion: string;
}

/**
 * El precio de una limpieza concreta.
 *
 * `precioCerrado` gana siempre: si alguien se ha tomado la molestia de fijar
 * el precio de esa vivienda, es porque la tarifa general no le vale.
 */
export function precioDeLimpieza({
  servicio,
  huespedes,
  precioCerrado,
  linea,
}: {
  servicio: Servicio;
  /** Cuántos vienen. Si no se sabe, los incluidos en la tarifa. */
  huespedes: number | null;
  /** El precio fijado para esta vivienda y este servicio, si lo hay. */
  precioCerrado?: number | null;
  /** La línea de la tarifa del propietario para este servicio. */
  linea?: LineaDeTarifa | null;
}): PrecioDeLimpieza {
  if (precioCerrado !== null && precioCerrado !== undefined) {
    return {
      precio: round2(precioCerrado),
      explicacion: `Precio cerrado de la vivienda para ${servicio}`,
    };
  }

  if (!linea || linea.servicio !== servicio) {
    return {
      precio: null,
      explicacion: `No hay tarifa de ${servicio} para esta vivienda. Ponlo a mano.`,
    };
  }

  // Sin número de huéspedes se cobra la base: es lo que menos se aleja, y
  // subir el precio por un dato que no se tiene sería cobrar de más.
  const vienen = huespedes ?? linea.huespedesIncluidos;
  const adicionales = Math.max(0, vienen - linea.huespedesIncluidos);
  const precio = round2(linea.base + adicionales * linea.porHuespedAdicional);

  if (adicionales === 0) {
    return { precio, explicacion: `${linea.base} € de ${servicio}` };
  }
  return {
    precio,
    explicacion:
      `${linea.base} € de ${servicio} (hasta ${linea.huespedesIncluidos}) ` +
      `+ ${adicionales} × ${linea.porHuespedAdicional} €`,
  };
}

/**
 * La tarifa que está en vigor en una fecha.
 *
 * Una tarifa con `vigenteHasta` a nulo sigue vigente. Se elige la que empezó
 * más tarde de las que ya habían empezado: subir precios no puede cambiar
 * retroactivamente lo que se facturó el mes pasado.
 */
export function tarifaVigente<T extends { vigenteDesde: Date; vigenteHasta: Date | null }>(
  tarifas: T[],
  cuando: Date
): T | null {
  const candidatas = tarifas
    .filter((t) => t.vigenteDesde <= cuando && (t.vigenteHasta === null || t.vigenteHasta >= cuando))
    .sort((a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime());
  return candidatas[0] ?? null;
}

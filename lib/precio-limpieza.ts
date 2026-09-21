/**
 * El precio de una limpieza, resuelto contra la base de datos.
 *
 * `lib/tarifas.ts` tiene el cálculo puro y sus pruebas; esto es solo la capa
 * que va a buscar los datos: el precio cerrado de la vivienda, la tarifa del
 * propietario y sus líneas.
 *
 * El orden es el de siempre, de lo particular a lo general:
 *
 *   1. **Precio cerrado de la vivienda** (`TarifaVivienda`). Villa Mónica son
 *      120 € y da igual cuántos vengan.
 *   2. **La línea de la tarifa del propietario** para ese servicio: base con
 *      unos huéspedes incluidos, más un suplemento por cada uno que pase.
 *   3. **El precio fijo de la vivienda** (`Property.cleaningPrice`), que es
 *      como funcionaba esto antes. Se deja de último recurso para no romper
 *      las viviendas que ya lo tenían puesto.
 *   4. Si no hay nada de lo anterior, **no hay precio**: `null`. Vale más una
 *      limpieza marcada «sin precio», que se ve y se arregla, que una a 0 €,
 *      que se cuela hasta la factura.
 */

import { startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { servicioDeLaSalida } from "./limpiezas";
import { precioDeLimpieza, tarifaVigente, type LineaDeTarifa, type Servicio } from "./tarifas";

export interface PrecioResuelto {
  /** `null` cuando no hay manera de saberlo. */
  precio: number | null;
  /** De dónde ha salido, para poder enseñarlo y discutirlo. */
  explicacion: string;
}

/**
 * Cuánto cuesta limpiar esta vivienda, este servicio, con estos huéspedes.
 *
 * `fecha` es la de la limpieza: decide qué tarifa estaba en vigor. Subir los
 * precios no puede cambiar lo que se facturó el mes pasado.
 */
export async function precioParaLimpieza({
  organizationId,
  propertyId,
  servicio,
  huespedes,
  fecha = new Date(),
}: {
  organizationId: string;
  propertyId: string;
  servicio: Servicio;
  /** Los de quien se va. `null` si no se sabe. */
  huespedes: number | null;
  fecha?: Date;
}): Promise<PrecioResuelto> {
  const vivienda = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: {
      cleaningPrice: true,
      TarifaVivienda: { where: { servicio }, select: { precioCerrado: true } },
      owner: {
        select: {
          tarifa: {
            select: {
              vigenteDesde: true,
              vigenteHasta: true,
              lineas: { where: { servicio } },
            },
          },
        },
      },
    },
  });

  if (!vivienda) {
    return { precio: null, explicacion: "Esa vivienda no existe." };
  }

  const cerrado = vivienda.TarifaVivienda[0];
  const tarifa = vivienda.owner?.tarifa ?? null;
  // Una tarifa que ya no está en vigor no se aplica: es lo mismo que no tener.
  const enVigor = tarifa && tarifaVigente([tarifa], fecha) ? tarifa : null;
  const lineaCruda = enVigor?.lineas[0];

  const linea: LineaDeTarifa | null = lineaCruda
    ? {
        servicio: lineaCruda.servicio as Servicio,
        base: Number(lineaCruda.base),
        huespedesIncluidos: lineaCruda.huespedesIncluidos,
        porHuespedAdicional: Number(lineaCruda.porHuespedAdicional),
      }
    : null;

  const calculado = precioDeLimpieza({
    servicio,
    huespedes,
    precioCerrado: cerrado ? Number(cerrado.precioCerrado) : null,
    linea,
  });

  if (calculado.precio !== null) return calculado;

  // Último recurso: el precio fijo de la vivienda, como se hacía antes.
  const fijo = Number(vivienda.cleaningPrice);
  if (fijo > 0) {
    return { precio: fijo, explicacion: "Precio fijo de la vivienda (sin tarifa)" };
  }

  return {
    precio: null,
    explicacion:
      `Sin tarifa de ${servicio} ni precio para esta vivienda. ` +
      "Asígnale una tarifa al propietario o ponle precio a la vivienda.",
  };
}

/**
 * Todo lo que hay que saber para apuntar la limpieza que deja una salida:
 * si es salida o repaso, con cuántos huéspedes y a qué precio.
 *
 * Se usa en los tres sitios donde nace una limpieza de una reserva —el alta a
 * mano, la sincronización de Lodgify y la importación— para que las tres
 * cobren igual. Antes cada una copiaba el precio fijo de la vivienda y ninguna
 * miraba cuánta gente venía.
 */
export async function limpiezaDeSalida({
  organizationId,
  propertyId,
  bookingId,
  checkOut,
  huespedes,
}: {
  organizationId: string;
  propertyId: string;
  /** Para no compararla consigo misma al buscar la siguiente entrada. */
  bookingId?: string;
  checkOut: Date;
  /** Los de quien se va. */
  huespedes: number | null;
}): Promise<{ servicio: Servicio; huespedes: number | null; precio: number | null; explicacion: string }> {
  // La siguiente entrada en esa vivienda, que es la que decide si toca una
  // salida o un repaso. Basta con la primera: la consulta ya la ordena.
  const siguiente = await prisma.booking.findFirst({
    where: {
      organizationId,
      propertyId,
      status: "CONFIRMED",
      checkIn: { gte: startOfDay(checkOut) },
      ...(bookingId ? { NOT: { id: bookingId } } : {}),
    },
    orderBy: { checkIn: "asc" },
    select: { checkIn: true },
  });

  const servicio = servicioDeLaSalida(checkOut, siguiente?.checkIn ?? null);
  const { precio, explicacion } = await precioParaLimpieza({
    organizationId,
    propertyId,
    servicio,
    huespedes,
    fecha: checkOut,
  });

  return { servicio, huespedes, precio, explicacion };
}

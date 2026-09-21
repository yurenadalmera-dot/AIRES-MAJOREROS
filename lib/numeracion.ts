// Numeración de facturas, aparte para poder probarla sin base de datos.
//
// El fallo que esto evita: el número salía de CONTAR las facturas del año. Al
// anular una, el contador baja y el siguiente número ya existe; como
// `invoiceNumber` es único, la factura no se podía emitir. Y reutilizar un
// número rompe la correlatividad, con hueco o sin él.

import { format } from "date-fns";

export function prefijoFacturas(fecha: Date = new Date()): string {
  return `AM-${format(fecha, "yyyy")}-`;
}

/**
 * Siguiente número a partir del más alto ya emitido.
 *
 * `ultimoNumero` es el mayor del año, o null si todavía no hay ninguna.
 */
export function numeroSiguiente(prefijo: string, ultimoNumero: string | null): string {
  const ultimoOrdinal = ultimoNumero ? Number(ultimoNumero.slice(prefijo.length)) : 0;
  const siguiente = Number.isFinite(ultimoOrdinal) && ultimoOrdinal >= 0 ? ultimoOrdinal + 1 : 1;
  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

/**
 * La serie de los resúmenes, aparte de la de facturas.
 *
 * Un resumen no es una factura: es informativo, no lleva impuesto y no tiene
 * efectos fiscales. Si gastara números de la serie de facturas, esa serie
 * quedaría con huecos que no corresponden a ninguna factura — justo lo que la
 * correlatividad no permite.
 */
export function prefijoResumenes(fecha: Date = new Date()): string {
  return `RES-${format(fecha, "yyyy")}-`;
}

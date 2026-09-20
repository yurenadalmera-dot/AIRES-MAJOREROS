/**
 * Qué comisión se lleva cada canal de venta.
 *
 * Hasta ahora la aplicación aplicaba un único porcentaje a todas las reservas,
 * y eso no se parece a la realidad: Airbnb se queda el 15 % y Booking.com el
 * 18 %. Con un solo número, el neto de cada reserva sale mal y con él todos
 * los informes del año.
 *
 * El nombre del canal llega tal como lo escribe Lodgify, que no es constante:
 * «Booking.com», «booking.com», «Booking .com». Se compara normalizado —en
 * minúsculas, sin espacios ni puntos— para que las tres sean la misma.
 */

/** La forma canónica de un nombre de canal, para compararlos. */
export function normalizarCanal(canal: string): string {
  return canal
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[\s._-]/g, "")
    .trim();
}

export interface ComisionDeCanal {
  canal: string;
  platformPct: number;
}

/**
 * Busca el porcentaje del canal de una reserva.
 *
 * Si ese canal no está configurado se usa el porcentaje general, que es lo que
 * había antes: así, no configurar nada deja la aplicación como estaba, y
 * configurar solo Airbnb y Booking arregla justo esas dos.
 */
export function comisionParaCanal(
  canal: string | null | undefined,
  configuradas: ComisionDeCanal[],
  porDefecto: number
): number {
  if (!canal) return porDefecto;
  const buscado = normalizarCanal(canal);
  const encontrada = configuradas.find((c) => normalizarCanal(c.canal) === buscado);
  return encontrada ? encontrada.platformPct : porDefecto;
}

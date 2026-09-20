/**
 * Leer una lista de fechas escritas a mano o pegadas de un Excel.
 *
 * Las limpiezas de las viviendas que no están en Lodgify se apuntan a mano, y
 * son del orden de cien al año. Teclearlas de una en una, con el formulario
 * recargándose cada vez, es media tarde; pegar la columna de fechas de salida
 * del Excel es un minuto.
 *
 * Se aceptan las formas en que la gente escribe una fecha aquí:
 *
 *   04/09/2026   4/9/2026   04-09-2026   04.09.2026   2026-09-04
 *
 * Con día primero, que es como se escribe en España. `2026-09-04` se reconoce
 * por llevar el año delante (cuatro cifras), que es lo que manda un campo de
 * fecha del navegador.
 */

export interface FechasLeidas {
  /** Las que se han entendido, ordenadas y sin repetir. */
  fechas: Date[];
  /** Lo que no se ha entendido, tal cual venía, para poder decirlo. */
  invalidas: string[];
}

function aFecha(dia: number, mes: number, anio: number): Date | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // Mediodía: así ningún cambio de huso mueve la fecha al día anterior.
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
  // Rechaza los 31 de febrero: el Date los habría corrido al mes siguiente.
  if (d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1) return null;
  return d;
}

function leerUna(texto: string): Date | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  // 2026-09-04 (el año delante)
  const iso = limpio.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return aFecha(Number(iso[3]), Number(iso[2]), Number(iso[1]));

  // 04/09/2026, 4-9-26, 04.09.2026
  const es = limpio.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (es) {
    const anio = Number(es[3]);
    return aFecha(Number(es[1]), Number(es[2]), anio < 100 ? 2000 + anio : anio);
  }

  return null;
}

export function leerFechas(texto: string): FechasLeidas {
  const trozos = texto
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const porTiempo = new Map<number, Date>();
  const invalidas: string[] = [];

  for (const trozo of trozos) {
    const fecha = leerUna(trozo);
    if (fecha) porTiempo.set(fecha.getTime(), fecha);
    else invalidas.push(trozo);
  }

  return {
    fechas: [...porTiempo.values()].sort((a, b) => a.getTime() - b.getTime()),
    invalidas,
  };
}

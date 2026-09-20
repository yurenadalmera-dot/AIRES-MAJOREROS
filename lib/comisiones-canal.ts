/**
 * Qué comisión se lleva cada reserva.
 *
 * Esto salió de mirar el Excel de reservas de 2026, y no es lo que parecía:
 *
 *   - **Airbnb: 15,5 %** en todos los apartamentos, y sin comisión bancaria.
 *   - **Booking: 17 %** en el Apto 27 y el Apto 8206, **15 %** en los demás.
 *     No es un redondeo ni una excepción: 21 de 21 y 20 de 20 reservas.
 *   - **Bancaria: 1,3 %**, y solo en Booking.
 *
 * Es decir, la comisión depende del canal **y** del apartamento. Con un único
 * porcentaje —como estaba— el neto de cada reserva sale mal, y con él los
 * informes del año.
 *
 * El nombre del canal llega de Lodgify sin forma fija («Booking.com»,
 * «booking.com», «Booking .com»), así que se compara normalizado.
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

export interface ComisionConfigurada {
  canal: string;
  /** `null` = vale para todas las viviendas de ese canal. */
  propertyId: string | null;
  platformPct: number;
  /** `null` = se usa la comisión bancaria general. */
  bankPct: number | null;
}

export interface ComisionAplicable {
  platformPct: number;
  bankPct: number;
}

/**
 * Busca qué comisión toca, de lo más concreto a lo más general:
 *
 *   1. la de ese canal **en esa vivienda**,
 *   2. la de ese canal en general,
 *   3. los porcentajes por defecto.
 *
 * No configurar nada deja la aplicación exactamente como estaba.
 */
export function comisionAplicable(
  canal: string | null | undefined,
  propertyId: string | null | undefined,
  configuradas: ComisionConfigurada[],
  porDefecto: { platformPct: number; bankPct: number }
): ComisionAplicable {
  if (!canal) return { ...porDefecto };

  const buscado = normalizarCanal(canal);
  const delCanal = configuradas.filter((c) => normalizarCanal(c.canal) === buscado);

  const elegida =
    (propertyId ? delCanal.find((c) => c.propertyId === propertyId) : undefined) ??
    delCanal.find((c) => c.propertyId === null);

  if (!elegida) return { ...porDefecto };

  return {
    platformPct: elegida.platformPct,
    bankPct: elegida.bankPct ?? porDefecto.bankPct,
  };
}

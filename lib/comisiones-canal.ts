/**
 * Qué comisión se lleva cada reserva.
 *
 * Esto salió de mirar el Excel de reservas de 2026, y no es lo que parecía:
 *
 *   - **Airbnb: 15,5 %** en todos los apartamentos, y sin comisión bancaria.
 *   - **Booking: 17 %** en el Apto 8206 y en el que el Excel llama «Apto 27»
 *     —que es Montaña Guerime—, **15 %** en los demás. No es un redondeo ni
 *     una excepción: 20 de 20 y 21 de 21 reservas.
 *   - **Bancaria: 1,3 %**, y solo en Booking.
 *
 * Es decir, la comisión depende del canal **y** del apartamento. Con un único
 * porcentaje —como estaba— el neto de cada reserva sale mal, y con él los
 * informes del año.
 *
 * El nombre del canal llega de Lodgify sin forma fija («Booking.com»,
 * «booking.com», «Booking .com»), así que se compara normalizado.
 */

/**
 * Lo que se lleva cada canal, **comprobado contra papeles reales**.
 *
 * Esto no es una estimación. Sale de dos sitios distintos que dicen lo mismo:
 * las 152 reservas de los Excel de 2026 y el informe semanal que Inversiones
 * Brito venía recibiendo del sistema anterior, que cuadra al céntimo en las
 * cuatro cifras de cabecera (`tests/numeros-reales.test.ts`).
 *
 * Importa distinguirlo de lo que traía Mirador, que son **supuestos** que él
 * mismo marca como tales: Booking al 15 % «pendiente de contrastar con una
 * factura real», Airbnb al 15 % «el más dudoso», y ninguna comisión bancaria.
 * Al traerse los datos, lo comprobado manda sobre lo supuesto.
 *
 * Los nombres de canal son los que manda Lodgify —`BookingCom`,
 * `AirbnbIntegration`, `OH`, `Manual`—, comprobados en las 815 reservas que
 * Mirador tiene cargadas.
 */
export interface ComisionContrastada {
  canal: string;
  /** El nombre de la vivienda cuando el porcentaje es solo suyo. */
  vivienda: string | null;
  platformPct: number;
  /** `null` = la general. */
  bankPct: number | null;
  nota: string;
}

export const COMISIONES_CONTRASTADAS: ComisionContrastada[] = [
  {
    canal: "AirbnbIntegration",
    vivienda: null,
    platformPct: 15.5,
    bankPct: 0,
    nota: "Contrastado: 15,5 % en todas las viviendas y sin comisión bancaria (Excel de reservas 2026).",
  },
  {
    canal: "BookingCom",
    vivienda: null,
    platformPct: 15,
    bankPct: 1.3,
    nota: "Contrastado dos veces: Excel de reservas 2026 e informe semanal de Inversiones Brito.",
  },
  {
    canal: "BookingCom",
    vivienda: "Apto 8206",
    platformPct: 17,
    bankPct: 1.3,
    nota: "Contrastado: 20 de 20 reservas al 17 %, no al 15 % de las demás. El informe semanal de Brito lo confirma por separado.",
  },
  {
    // El Excel lo llama «Apto 27»; en Mirador ese piso es **Montaña Guerime**
    // (confirmado por Yurena el 20/09). Se deja escrito con el nombre del
    // Excel, que es de donde salió el 17 %, y el alias lo lleva hasta la
    // vivienda buena: así no se pierde de dónde viene el dato.
    canal: "BookingCom",
    vivienda: "Apto 27",
    platformPct: 17,
    bankPct: 1.3,
    nota: "Contrastado: 21 de 21 reservas al 17 %. En el Excel es «Apto 27»; aquí es Montaña Guerime, el mismo piso con otro nombre.",
  },
];

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

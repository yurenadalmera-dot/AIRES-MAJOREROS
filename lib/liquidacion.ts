import { round2 } from "./money";

/**
 * Lo que se le liquida a un propietario en un periodo.
 *
 * Hay tres formas de cobrar, y conviene tenerlas a la vista porque son
 * distintas de verdad:
 *
 *   - **Grupo Villa Mónica** (Inversiones Brito): 30 % de gestión.
 *   - **Villa Monikka** (Inversiones Brito): 10 % de gestión.
 *   - **Academia Cañada**: 600 € fijos al mes, sin porcentaje.
 *   - **Domingo Javier**: nada de gestión — solo se le gestiona la limpieza.
 *
 * El porcentaje se aplica **después de gastos**, no sobre el precio de la
 * reserva. Es decir: se parte de lo que entra, se quitan las comisiones de
 * venta (Booking, Airbnb, banco) y los gastos de la vivienda, y sobre lo que
 * queda se calcula la comisión de gestión.
 *
 * ⚠️ Inversiones Brito suele pasar ellos el importe de la liquidación. Lo que
 * calcula esto es **la referencia**: sirve para ver si lo que liquidan cuadra
 * con lo que debería salir, no para sustituirlo.
 */

export interface ReservaDelPeriodo {
  totalPrice: number;
  platformCommissionAmt: number;
  bankCommissionAmt: number;
}

export interface Liquidacion {
  /** Lo que han pagado los huéspedes. */
  ingresos: number;
  /** Lo que se han llevado Booking, Airbnb y el banco. */
  comisionesDeVenta: number;
  /** Lo que ha costado mantener la vivienda: luz, agua, reparaciones… */
  gastos: number;
  /** Ingresos − comisiones de venta − gastos. Sobre esto va la comisión. */
  baseDeGestion: number;
  /** Lo que se lleva Aires por gestionar. */
  comisionDeGestion: number;
  /** Cómo se ha calculado, para poder explicarlo en el informe. */
  detalleDeLaComision: string;
  /** Lo que le queda al propietario. */
  alPropietario: number;
}

export function calcularLiquidacion({
  reservas,
  gastos,
  managementPct,
  cuotaFijaMensual,
  meses = 1,
}: {
  reservas: ReservaDelPeriodo[];
  gastos: number[];
  /** Porcentaje de gestión de las viviendas. `null` = no se cobra gestión. */
  managementPct: number | null;
  /** Cuota fija mensual, si el propietario paga cuota en vez de porcentaje. */
  cuotaFijaMensual: number | null;
  /** Cuántos meses cubre el periodo, para la cuota fija. */
  meses?: number;
}): Liquidacion {
  const ingresos = round2(reservas.reduce((s, r) => s + r.totalPrice, 0));
  const comisionesDeVenta = round2(
    reservas.reduce((s, r) => s + r.platformCommissionAmt + r.bankCommissionAmt, 0)
  );
  const totalGastos = round2(gastos.reduce((s, g) => s + g, 0));
  const baseDeGestion = round2(ingresos - comisionesDeVenta - totalGastos);

  // La cuota fija manda sobre el porcentaje: quien paga cuota, paga cuota.
  let comisionDeGestion = 0;
  let detalleDeLaComision = "Sin comisión de gestión";

  if (cuotaFijaMensual !== null && cuotaFijaMensual > 0) {
    comisionDeGestion = round2(cuotaFijaMensual * meses);
    detalleDeLaComision =
      meses === 1
        ? `Cuota fija mensual de ${cuotaFijaMensual} €`
        : `Cuota fija de ${cuotaFijaMensual} € × ${meses} meses`;
  } else if (managementPct !== null && managementPct > 0) {
    // Sobre una base negativa no se cobra: un mes con más gastos que ingresos
    // no genera comisión, genera pérdida.
    comisionDeGestion = baseDeGestion > 0 ? round2((baseDeGestion * managementPct) / 100) : 0;
    detalleDeLaComision = `${managementPct} % sobre ${baseDeGestion.toFixed(2)} € (después de gastos)`;
  }

  return {
    ingresos,
    comisionesDeVenta,
    gastos: totalGastos,
    baseDeGestion,
    comisionDeGestion,
    detalleDeLaComision,
    alPropietario: round2(baseDeGestion - comisionDeGestion),
  };
}

/**
 * Qué comisión de gestión le toca a una vivienda.
 *
 * Lo normal es que venga de su grupo: Inversiones Brito tiene dos, el Grupo
 * Villa Mónica al 30 % y Villa Monikka al 10 %. Poner el porcentaje en cada
 * vivienda obligaría a repetirlo once veces y bastaría olvidarse de una para
 * que la liquidación saliera mal.
 *
 * Una vivienda suelta, sin grupo, puede llevar el suyo propio. Y si no tiene
 * ni grupo ni porcentaje, no se cobra gestión — es el caso de las de Domingo
 * Javier, a las que solo se les gestiona la limpieza.
 */
export function comisionDeGestionDe(vivienda: {
  managementPct: number | null;
  group: { managementPct: number | null } | null;
}): number | null {
  const delGrupo = vivienda.group?.managementPct;
  if (delGrupo !== null && delGrupo !== undefined) return delGrupo;
  return vivienda.managementPct;
}

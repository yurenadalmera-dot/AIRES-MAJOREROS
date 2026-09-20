// Cálculo de comisiones y neto a percibir. Se centraliza aquí porque se usa
// tanto al crear/editar una reserva a mano como en el sync de Lodgify, y debe
// dar siempre el mismo resultado.

export interface CommissionInput {
  totalPrice: number;
  platformCommissionPct: number;
  bankCommissionPct: number;
}

export interface CommissionResult {
  platformCommissionAmt: number;
  bankCommissionAmt: number;
  netAmount: number;
}

/** Redondea a 2 decimales evitando errores de coma flotante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula comisión de plataforma, comisión bancaria y neto a percibir,
 * aplicando ambos porcentajes sobre el precio total de la reserva (Lodgify
 * no desglosa estos importes, así que se derivan siempre así salvo ajuste
 * manual explícito del usuario).
 */
export function calculateCommissions({
  totalPrice,
  platformCommissionPct,
  bankCommissionPct,
}: CommissionInput): CommissionResult {
  const platformCommissionAmt = round2((totalPrice * platformCommissionPct) / 100);
  const bankCommissionAmt = round2((totalPrice * bankCommissionPct) / 100);
  const netAmount = round2(totalPrice - platformCommissionAmt - bankCommissionAmt);
  return { platformCommissionAmt, bankCommissionAmt, netAmount };
}

// Acepta number/string y también objetos tipo Decimal de Prisma (que solo
// garantizan toString()), para poder pasar directamente los campos
// numéricos que vienen del ORM sin convertirlos a mano en cada pantalla.
export function formatCurrency(value: number | string | { toString(): string }): string {
  const n = typeof value === "number" ? value : parseFloat(value.toString());
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(n) ? n : 0);
}

/**
 * Lee un importe escrito como lo escribe la gente, o como viene impreso en
 * una factura: «120,50», «120.50», «1.234,56», «1.234,56 €».
 *
 * Devuelve `null` cuando no hay un número que leer — nunca 0. Un hueco genera
 * una pregunta; un cero se contabiliza en silencio.
 *
 * El caso que obliga a esto: antes se hacía `replace(",", ".")` a secas, así
 * que «1.234,56» salía «1.234.56» y de ahí `NaN`. Cualquier gasto de más de
 * mil euros escrito con puntos era imposible de apuntar.
 */
export function leerImporte(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;

  const limpio = valor.replace(/[€$\s  ]/g, "").replace(/^\+/, "");
  if (!/^-?[\d.,]+$/.test(limpio) || !/\d/.test(limpio)) return null;

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  let normal: string;

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Están los dos: el último manda como decimal, el otro era de miles.
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    normal = limpio.split(miles).join("").replace(decimal, ".");
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    const sep = ultimaComa >= 0 ? "," : ".";
    const trozos = limpio.split(sep);
    // Un único separador seguido de exactamente tres cifras es de miles:
    // «1.234» son mil doscientos treinta y cuatro, no uno con doscientos.
    const esDeMiles = trozos.length === 2 && trozos[1].length === 3 && /\d/.test(trozos[0]);
    normal = trozos.length > 2 || esDeMiles ? trozos.join("") : trozos.join(".");
  } else {
    normal = limpio;
  }

  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateLong(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Reparte un importe total entre dos socias según porcentajes configurables.
 *
 * Cada parte sale de SU porcentaje. Antes la segunda se calculaba por resta,
 * lo que hacía que `partnerBPercent` se ignorase: con un 70/20 la segunda
 * socia cobraba el 30 % en lugar del 20 %, sin previo aviso.
 *
 * Cuando los dos porcentajes suman 100 —el caso normal, que es lo que guarda
 * la pantalla de ajustes— el resto del redondeo se le suma a la segunda parte,
 * para que A + B dé exactamente el total y la factura cuadre al céntimo.
 */
export function splitAmount(total: number, partnerAPercent: number, partnerBPercent: number) {
  const partnerAAmount = round2((total * partnerAPercent) / 100);

  const repartenElTotal = Math.abs(partnerAPercent + partnerBPercent - 100) < 0.005;
  const partnerBAmount = repartenElTotal
    ? round2(total - partnerAAmount)
    : round2((total * partnerBPercent) / 100);

  return { partnerAAmount, partnerBAmount };
}


/**
 * Base imponible, cuota e importe total de una factura.
 *
 * Aquí el impuesto es **IGIC**, no IVA: las dos empresas están en Fuerteventura
 * y en Canarias el tipo general es el 7 %. El tipo se guarda en cada factura al
 * emitirla, así que esto se calcula una vez y no se vuelve a tocar.
 */
export function calcularImpuesto(base: number, tipoPorcentaje: number) {
  const cuota = round2((base * tipoPorcentaje) / 100);
  return { base: round2(base), cuota, total: round2(round2(base) + cuota) };
}

/**
 * Los números del informe al propietario, en un solo sitio.
 *
 * Estaban dentro del componente que lo pinta, así que solo existían mientras
 * se miraba la pantalla. Ahora hacen falta también para mandarlo por correo, y
 * dos cálculos separados acaban desviándose: el propietario recibiría por
 * correo unas cifras y vería otras al entrar. De ahí que esto sea una función
 * y no esté copiado.
 *
 * Lo que liquida, en orden: ingresos de las reservas, menos comisiones de
 * venta (Booking, Airbnb, banco), menos las limpiezas y los demás gastos de la
 * vivienda. Sobre lo que queda va la comisión de gestión, que **no es la misma
 * para todas las viviendas**: sale del grupo al que pertenecen, así que un
 * propietario con dos grupos lleva dos porcentajes en el mismo informe.
 */

import { prisma } from "./prisma";
import { round2 } from "./money";
import { armarTramos, liquidarPropietario, cuotaDelPeriodo } from "./liquidacion";

/** Los `Decimal` de Prisma, a número; y `null` se queda en `null`. */
const num = (v: { toString(): string } | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export interface InformeDePropietario {
  owner: NonNullable<Awaited<ReturnType<typeof leerPropietario>>>;
  periodStart: Date;
  periodEnd: Date;
  bookings: Awaited<ReturnType<typeof leerReservas>>;
  cleaningTasks: Awaited<ReturnType<typeof leerLimpiezas>>;
  expenses: Awaited<ReturnType<typeof leerGastos>>;
  totals: { total: number; platform: number; bank: number; net: number };
  cleaningTotal: number;
  expensesTotal: number;
  liquidacion: ReturnType<typeof liquidarPropietario>;
  cuotaFija: { importe: number; detalle: string } | null;
  /** Reservas agrupadas por complejo, que es como las lee el propietario. */
  gruposDeReservas: [string, { nombre: string; reservas: Awaited<ReturnType<typeof leerReservas>> }][];
  cabecera: { etiqueta: string; valor: number }[];
}

function leerPropietario(organizationId: string, ownerId: string) {
  return prisma.owner.findFirst({
    where: { id: ownerId, organizationId },
    include: { properties: { include: { group: true } }, cuotas: true },
  });
}

function leerReservas(organizationId: string, propertyIds: string[], desde: Date, hasta: Date) {
  return prisma.booking.findMany({
    where: {
      organizationId,
      propertyId: { in: propertyIds },
      status: "CONFIRMED",
      checkIn: { gte: desde, lte: hasta },
    },
    include: { property: true },
    orderBy: { checkIn: "asc" },
  });
}

function leerLimpiezas(organizationId: string, propertyIds: string[], desde: Date, hasta: Date) {
  return prisma.cleaningTask.findMany({
    where: {
      organizationId,
      propertyId: { in: propertyIds },
      type: "CLEANING",
      billable: true,
      // Una limpieza cancelada no se ha hecho, así que no se le puede
      // descontar al propietario. Antes sí entraba, y el informe no cuadraba
      // con la factura, que solo cuenta las hechas.
      status: { not: "CANCELLED" },
      date: { gte: desde, lte: hasta },
    },
    include: { property: true },
    orderBy: { date: "asc" },
  });
}

function leerGastos(organizationId: string, propertyIds: string[], desde: Date, hasta: Date) {
  return prisma.expense.findMany({
    where: { organizationId, propertyId: { in: propertyIds }, date: { gte: desde, lte: hasta } },
    include: { property: true },
    orderBy: { date: "asc" },
  });
}

/**
 * Todo lo que necesita el informe de un propietario en un periodo.
 *
 * Devuelve `null` si ese propietario no existe en esta organización.
 */
export async function informeDePropietario({
  organizationId,
  ownerId,
  start,
  end,
}: {
  organizationId: string;
  ownerId: string;
  start: string;
  end: string;
}): Promise<InformeDePropietario | null> {
  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  periodEnd.setHours(23, 59, 59, 999);

  const owner = await leerPropietario(organizationId, ownerId);
  if (!owner) return null;

  const propertyIds = owner.properties.map((p) => p.id);
  const [bookings, cleaningTasks, expenses] = await Promise.all([
    leerReservas(organizationId, propertyIds, periodStart, periodEnd),
    leerLimpiezas(organizationId, propertyIds, periodStart, periodEnd),
    leerGastos(organizationId, propertyIds, periodStart, periodEnd),
  ]);

  const totals = bookings.reduce(
    (acc, b) => ({
      total: acc.total + Number(b.totalPrice),
      platform: acc.platform + Number(b.platformCommissionAmt),
      bank: acc.bank + Number(b.bankCommissionAmt),
      net: acc.net + Number(b.netAmount),
    }),
    { total: 0, platform: 0, bank: 0, net: 0 }
  );
  const cleaningTotal = round2(cleaningTasks.reduce((sum, t) => sum + Number(t.price), 0));
  const expensesTotal = round2(expenses.reduce((sum, g) => sum + Number(g.amount), 0));

  // Cada vivienda va al tramo de su grupo; una vivienda suelta hace tramo
  // propio. Es lo que permite que Inversiones Brito lleve el 30 % del Grupo
  // Chano y el 10 % de Villa Monikka en el mismo informe.
  const { tramos, tramoDe } = armarTramos({
    viviendas: owner.properties.map((p) => ({
      id: p.id,
      name: p.name,
      managementPct: num(p.managementPct),
      groupId: p.groupId,
      group: p.group ? { name: p.group.name, managementPct: num(p.group.managementPct) } : null,
    })),
    reservas: bookings.map((b) => ({
      propertyId: b.propertyId,
      totalPrice: Number(b.totalPrice),
      platformCommissionAmt: Number(b.platformCommissionAmt),
      bankCommissionAmt: Number(b.bankCommissionAmt),
    })),
    // Las limpiezas son un gasto más de la vivienda: bajan lo que se liquida
    // y, con ello, la base sobre la que se calcula la gestión.
    gastos: [
      ...cleaningTasks.map((t) => ({ propertyId: t.propertyId, amount: Number(t.price) })),
      ...expenses.map((g) => ({ propertyId: g.propertyId, amount: Number(g.amount) })),
    ],
  });

  // Las mismas reservas, agrupadas para pintarlas: el propietario las ve por
  // complejo y con su subtotal, que es como se las viene dando el informe que
  // ya recibe. Un listado corrido de veinte reservas no dice de dónde sale
  // cada parte.
  const reservasPorGrupo = new Map<string, { nombre: string; reservas: typeof bookings }>();
  for (const b of bookings) {
    const clave = tramoDe.get(b.propertyId) ?? "";
    if (!reservasPorGrupo.has(clave)) {
      reservasPorGrupo.set(clave, { nombre: tramos.get(clave)?.nombre ?? "Sin grupo", reservas: [] });
    }
    reservasPorGrupo.get(clave)!.reservas.push(b);
  }

  // Mes a mes y al importe que estuviera en vigor: la cuota sube, y cobrar la
  // de hoy por los meses de antes se factura de más.
  const cuotaFija = cuotaDelPeriodo({
    inicio: periodStart,
    fin: new Date(end),
    cuotas: owner.cuotas.map((c) => ({
      importe: Number(c.importe),
      desde: c.desde,
      hasta: c.hasta,
    })),
  });
  const liquidacion = liquidarPropietario({ tramos: [...tramos.values()], cuotaFija });

  // Las cuatro cifras de cabecera, las mismas que trae el informe que el
  // propietario ya recibe. «A percibir» es antes de gastos, como allí: los
  // gastos van aparte porque no siempre los adelanta la gestora.
  const cabecera = [
    { etiqueta: "Precio total reservas", valor: round2(totals.total) },
    { etiqueta: "Comisiones de venta", valor: round2(totals.platform + totals.bank) },
    { etiqueta: "A percibir en cuenta", valor: round2(totals.net) },
    { etiqueta: "Gastos del periodo", valor: round2(cleaningTotal + expensesTotal) },
  ];

  return {
    owner,
    periodStart,
    periodEnd,
    bookings,
    cleaningTasks,
    expenses,
    totals,
    cleaningTotal,
    expensesTotal,
    liquidacion,
    cuotaFija,
    gruposDeReservas: [...reservasPorGrupo.entries()],
    cabecera,
  };
}

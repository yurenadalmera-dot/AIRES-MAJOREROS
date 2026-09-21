import Link from "next/link";
import { startOfDay, endOfDay, addDays, differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { IconoEntrada, IconoSalida } from "@/components/iconos";
import { formatCurrency, formatDate, round2 } from "@/lib/money";
import { armarTramos, liquidarPropietario, cuotaDelPeriodo } from "@/lib/liquidacion";

/**
 * La semana y el año.
 *
 * Es el panel que Emma venía usando en Mirador, traído aquí. No repite el
 * «Panel del día», que mira solo a hoy: este abre la ventana a **siete días**
 * —para poder cuadrar limpiezas y llaves con tiempo— y añade las dos cosas que
 * allí se veían de un vistazo y aquí no estaban en ninguna pantalla: **cuánto
 * produce cada vivienda** y **cuánto se liquidaría hoy** a cada propietario.
 *
 * Dos diferencias a propósito con el de Mirador:
 *
 *   - Los totales son **del año en curso**, no de todo el histórico. Aquel
 *     sumaba 2025, 2026 y 2027 en la misma cifra, y una venta que mezcla tres
 *     años no es un número con el que se pueda hacer nada.
 *   - La liquidación se **calcula al abrir la página**, no se lee de un
 *     borrador guardado. Justo por lo que pasó en Mirador: el borrador se
 *     había generado antes de corregir la regla del 10 % y siguió enseñando
 *     3.197,95 € de más hasta que alguien lo regeneró a mano.
 */
export default async function PanelDeLaSemanaPage() {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");

  const hoy = startOfDay(new Date());
  const finDeLaVentana = endOfDay(addDays(hoy, 7));
  const inicioDeAnio = new Date(hoy.getFullYear(), 0, 1);
  const anio = hoy.getFullYear();

  const [viviendas, reservasDelAnio, movimientosDeLaSemana, propietarios, limpiezas, gastos] =
    await Promise.all([
      prisma.property.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true, lodgifyPropertyId: true },
        orderBy: { name: "asc" },
      }),
      prisma.booking.findMany({
        where: { organizationId, status: "CONFIRMED", checkIn: { gte: inicioDeAnio } },
        select: {
          propertyId: true,
          checkIn: true,
          checkOut: true,
          totalPrice: true,
          platformCommissionAmt: true,
          bankCommissionAmt: true,
        },
      }),
      prisma.booking.findMany({
        where: {
          organizationId,
          status: "CONFIRMED",
          OR: [
            { checkIn: { gte: hoy, lte: finDeLaVentana } },
            { checkOut: { gte: hoy, lte: finDeLaVentana } },
          ],
        },
        include: { property: { select: { name: true } } },
      }),
      prisma.owner.findMany({
        where: { organizationId },
        include: { properties: { include: { group: true } }, cuotas: true },
        orderBy: { name: "asc" },
      }),
      prisma.cleaningTask.findMany({
        where: { organizationId, date: { gte: inicioDeAnio } },
        select: { propertyId: true, price: true },
      }),
      prisma.expense.findMany({
        where: { organizationId, date: { gte: inicioDeAnio } },
        select: { propertyId: true, amount: true, type: true },
      }),
    ]);

  // ── Las cuatro cifras de arriba ─────────────────────────────────────
  const ventasDelAnio = round2(reservasDelAnio.reduce((s, r) => s + Number(r.totalPrice), 0));
  const sinLodgify = viviendas.filter((v) => !v.lodgifyPropertyId).length;

  // ── Los próximos siete días ─────────────────────────────────────────
  // Una fila por movimiento, no por reserva: lo que Emma necesita saber es
  // quién entra y quién sale cada día, y una misma reserva puede aportar las
  // dos cosas si es corta.
  type Movimiento = {
    clase: "entrada" | "salida";
    cuando: Date;
    vivienda: string;
    huesped: string;
    huespedes: number;
    canal: string;
  };
  const movimientos: Movimiento[] = [];
  for (const b of movimientosDeLaSemana) {
    const comun = {
      vivienda: b.property.name,
      huesped: b.guestName,
      huespedes: b.adults + b.children,
      canal: b.channel,
    };
    if (b.checkIn >= hoy && b.checkIn <= finDeLaVentana) {
      movimientos.push({ clase: "entrada", cuando: b.checkIn, ...comun });
    }
    if (b.checkOut >= hoy && b.checkOut <= finDeLaVentana) {
      movimientos.push({ clase: "salida", cuando: b.checkOut, ...comun });
    }
  }
  movimientos.sort(
    (a, b) => a.cuando.getTime() - b.cuando.getTime() || a.vivienda.localeCompare(b.vivienda)
  );

  // ── Lo que se liquidaría hoy ────────────────────────────────────────
  const liquidaciones = propietarios
    .map((p) => {
      const suyas = new Set(p.properties.map((v) => v.id));
      const { tramos } = armarTramos({
        viviendas: p.properties.map((v) => ({
          id: v.id,
          name: v.name,
          managementPct: v.managementPct === null ? null : Number(v.managementPct),
          groupId: v.groupId,
          group: v.group
            ? {
                name: v.group.name,
                managementPct: v.group.managementPct === null ? null : Number(v.group.managementPct),
              }
            : null,
        })),
        reservas: reservasDelAnio
          .filter((r) => suyas.has(r.propertyId))
          .map((r) => ({
            propertyId: r.propertyId,
            totalPrice: Number(r.totalPrice),
            platformCommissionAmt: Number(r.platformCommissionAmt),
            bankCommissionAmt: Number(r.bankCommissionAmt),
          })),
        gastos: [
          ...limpiezas
            .filter((t) => suyas.has(t.propertyId))
            .map((t) => ({ propertyId: t.propertyId, amount: Number(t.price) })),
          // Un traspaso entre cuentas o un sueldo no es un gasto de una
          // vivienda: solo restan los gastos de verdad.
          ...gastos
            .filter((g) => g.propertyId && suyas.has(g.propertyId) && g.type === "gasto")
            .map((g) => ({ propertyId: g.propertyId, amount: Number(g.amount) })),
        ],
      });
      return {
        propietario: p.name,
        liquidacion: liquidarPropietario({
          tramos: [...tramos.values()],
          // Mes a mes, al importe que tocaba: la cuota de Academia Cañada
          // empezó en 400 € y ha ido subiendo.
          cuotaFija: cuotaDelPeriodo({
            inicio: inicioDeAnio,
            fin: hoy,
            cuotas: p.cuotas.map((c) => ({
              importe: Number(c.importe),
              desde: c.desde,
              hasta: c.hasta,
            })),
          }),
        }),
      };
    })
    .filter((x) => x.liquidacion.ingresos > 0 || x.liquidacion.comisionDeGestion > 0);

  // ── La cartera, por lo que produce ──────────────────────────────────
  const rendimiento = viviendas
    .map((v) => {
      const suyas = reservasDelAnio.filter((r) => r.propertyId === v.id);
      return {
        nombre: v.name,
        reservas: suyas.length,
        noches: suyas.reduce((s, r) => s + Math.max(0, differenceInCalendarDays(r.checkOut, r.checkIn)), 0),
        ventas: round2(suyas.reduce((s, r) => s + Number(r.totalPrice), 0)),
        enLodgify: Boolean(v.lodgifyPropertyId),
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  return (
    <div>
      <PageHeader
        title="La semana y el año"
        subtitle={`Los próximos siete días, y cómo va ${anio}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={`Reservas ${anio}`} value={reservasDelAnio.length} hint="confirmadas" />
        <StatCard label={`Ventas ${anio}`} value={formatCurrency(ventasDelAnio)} hint="precio de las reservas" />
        <StatCard label="Viviendas activas" value={viviendas.length} />
        <StatCard
          label="Sin Lodgify"
          value={sinLodgify}
          tone={sinLodgify > 0 ? "warn" : "good"}
          hint={sinLodgify > 0 ? "estas hay que llevarlas a mano" : "todas se sincronizan solas"}
        />
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-medium text-tinta mb-1">
          Los próximos siete días ({movimientos.length})
        </h2>
        <p className="text-xs text-tinta-suave mb-3">
          De hoy al {formatDate(addDays(hoy, 7))}. Una línea por entrada y por salida.
        </p>

        {movimientos.length === 0 ? (
          <EmptyState message="No hay entradas ni salidas esta semana." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-tinta-suave uppercase tracking-wide border-b border-borde">
                  <th className="py-2 pr-3">Día</th>
                  <th className="py-2 pr-3">Qué</th>
                  <th className="py-2 pr-3">Vivienda</th>
                  <th className="py-2 pr-3">Huésped</th>
                  <th className="py-2 pr-3 text-right">Huéspedes</th>
                  <th className="py-2">Canal</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m, i) => (
                  <tr key={i} className="border-b border-borde last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-tinta-suave">
                      {formatDate(m.cuando)}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tono={m.clase === "entrada" ? "info" : "aviso"}>
                        {m.clase === "entrada" ? (
                          <IconoEntrada size={14} />
                        ) : (
                          <IconoSalida size={14} />
                        )}
                        {m.clase === "entrada" ? "Entra" : "Sale"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-medium text-tinta">{m.vivienda}</td>
                    <td className="py-2 pr-3 text-tinta-suave">{m.huesped}</td>
                    <td className="py-2 pr-3 text-right text-tinta-suave">{m.huespedes}</td>
                    <td className="py-2 text-tinta-suave">{m.canal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-medium text-tinta mb-1">Lo que se liquidaría hoy</h2>
        <p className="text-xs text-tinta-suave mb-3">
          Del 1 de enero a hoy, con los datos que hay ahora mismo. Se calcula al abrir esta
          página, así que no puede quedarse antiguo.{" "}
          <Link href="/rental/reports" className="underline">
            El informe formal se saca aquí
          </Link>
          .
        </p>

        {liquidaciones.length === 0 ? (
          <EmptyState message="Todavía no hay reservas ni gastos que liquidar." />
        ) : (
          <div className="space-y-3">
            {liquidaciones.map((x) => (
              <div key={x.propietario} className="border border-borde rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className="font-medium text-tinta">{x.propietario}</span>
                  <span className="text-sm text-tinta-suave">
                    base {formatCurrency(x.liquidacion.baseDeGestion)}
                  </span>
                </div>

                {x.liquidacion.tramos.some((t) => t.comisionDeGestion > 0) && (
                  <div className="space-y-1 mb-2">
                    {x.liquidacion.tramos
                      .filter((t) => t.comisionDeGestion > 0)
                      .map((t) => (
                      <div key={t.nombre} className="flex justify-between gap-2 text-sm">
                        <span className="text-tinta-suave">
                          {t.nombre}
                          <span className="text-xs text-tinta-suave"> · {t.detalleDeLaComision}</span>
                        </span>
                        <span className="text-tinta whitespace-nowrap">
                          {formatCurrency(t.comisionDeGestion)}
                        </span>
                        </div>
                      ))}
                  </div>
                )}

                <div className="flex justify-between gap-2 text-sm font-medium border-t border-borde pt-2">
                  <span className="text-tinta">
                    Comisión de gestión
                    {/* Quien paga cuota no tiene tramos, así que sin esto no se
                        vería de dónde sale el importe — y con una cuota que ha
                        ido subiendo, eso es justo lo que hay que poder mirar. */}
                    {x.liquidacion.tramos.length === 0 && (
                      <span className="block text-xs font-normal text-tinta-suave">
                        {x.liquidacion.detalleDeLaComision}
                      </span>
                    )}
                  </span>
                  <span className="text-tinta">
                    {formatCurrency(x.liquidacion.comisionDeGestion)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-tinta-suave">A percibir el propietario</span>
                  <span className="text-tinta-suave">{formatCurrency(x.liquidacion.alPropietario)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="font-medium text-tinta mb-1">La cartera, por lo que produce</h2>
        <p className="text-xs text-tinta-suave mb-3">Reservas de {anio}, de más a menos ventas.</p>

        {rendimiento.length === 0 ? (
          <EmptyState message="Todavía no hay viviendas activas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-tinta-suave uppercase tracking-wide border-b border-borde">
                  <th className="py-2 pr-3">Vivienda</th>
                  <th className="py-2 pr-3 text-right">Reservas</th>
                  <th className="py-2 pr-3 text-right">Noches</th>
                  <th className="py-2 text-right">Ventas</th>
                </tr>
              </thead>
              <tbody>
                {rendimiento.map((v) => (
                  <tr key={v.nombre} className="border-b border-borde last:border-0">
                    <td className="py-2 pr-3 font-medium text-tinta">
                      {v.nombre}
                      {!v.enLodgify && (
                        <span className="ml-2 text-xs text-tinta-suave">a mano</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-tinta-suave">{v.reservas}</td>
                    <td className="py-2 pr-3 text-right text-tinta-suave">{v.noches}</td>
                    <td className="py-2 text-right text-tinta">{formatCurrency(v.ventas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

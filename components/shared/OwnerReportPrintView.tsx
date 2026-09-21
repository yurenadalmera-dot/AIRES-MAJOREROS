import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintButton, BackButton } from "@/components/ui";
import { Marca } from "@/components/Marca";
import MarcarInformeEnviado from "@/components/MarcarInformeEnviado";
import { formatCurrency, formatDate, round2 } from "@/lib/money";
import { BUSINESS_TYPES } from "@/lib/constants";
import { informeDePropietario } from "@/lib/informe-propietario";

/**
 * Informe imprimible de propietario. Compartido por ambos negocios: siempre
 * lee las mismas reservas y las mismas `CleaningTask`, así que el documento es
 * idéntico se pida desde donde se pida. `backHref` solo cambia a qué panel
 * vuelve el botón de "Volver".
 *
 * Lo que liquida, en orden: ingresos de las reservas, menos las comisiones de
 * venta (Booking, Airbnb, banco), menos las limpiezas y los demás gastos de la
 * vivienda. Sobre lo que queda va la comisión de gestión de Aires, que **no es
 * la misma para todas las viviendas**: sale del grupo al que pertenecen, así
 * que un propietario con dos grupos lleva dos porcentajes en el mismo informe.
 */
export default async function OwnerReportPrintView({
  organizationId,
  ownerId,
  start,
  end,
  backHref,
}: {
  organizationId: string;
  ownerId: string;
  start: string;
  end: string;
  backHref: string;
}) {
  // Los números viven en `lib/informe-propietario.ts`, no aquí: el mismo
  // informe se manda por correo, y dos cálculos separados acaban desviándose.
  const datos = await informeDePropietario({ organizationId, ownerId, start, end });
  if (!datos) notFound();

  const {
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
    gruposDeReservas,
    cabecera,
  } = datos;
  const desglosePorGrupo = liquidacion.tramos.filter((t) => t.comisionDeGestion > 0);

  const [rentalBusiness, ultimoEnvio] = await Promise.all([
    prisma.business.findFirst({
      where: { organizationId, type: BUSINESS_TYPES.RENTAL_MANAGEMENT },
    }),
    // ¿Consta ya un envío de este mismo periodo? Evita mandarlo dos veces.
    prisma.envioDeInforme.findFirst({
      where: { ownerId, periodStart: periodStart },
      orderBy: { enviadoEl: "desc" },
      select: { enviadoEl: true },
    }),
  ]);

  /** Los totales de un puñado de reservas, para el subtotal de cada grupo. */
  const totalesDe = (rs: typeof bookings) =>
    rs.reduce(
      (a, b) => ({
        total: round2(a.total + Number(b.totalPrice)),
        platform: round2(a.platform + Number(b.platformCommissionAmt)),
        bank: round2(a.bank + Number(b.bankCommissionAmt)),
        net: round2(a.net + Number(b.netAmount)),
      }),
      { total: 0, platform: 0, bank: 0, net: 0 }
    );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4 no-print">
        <BackButton href={backHref} />
        <div className="flex flex-wrap items-center gap-3">
          <MarcarInformeEnviado
            ownerId={ownerId}
            start={start}
            end={end}
            yaEnviado={ultimoEnvio?.enviadoEl.toISOString() ?? null}
          />
          <PrintButton />
        </div>
      </div>

      <div className="card print-area p-8">
        <div className="flex justify-between items-start border-b border-borde pb-4 mb-6">
          <div>
            {/* El informe que los propietarios ya venían recibiendo llega
                encabezado «Mirador de Sotavento» (ver docs/datos-reales.md),
                así que es su documento y lleva su logotipo. La factura de
                limpiezas, que emite Aires Majoreros SL, lleva el de Aires. */}
            <Marca negocio="rental" alto={52} className="mb-3" />
            <h1 className="serif text-2xl text-marina">Informe de propietario</h1>
            <p className="text-sm text-tinta-suave mt-1">{rentalBusiness?.legalName ?? rentalBusiness?.name}</p>
          </div>
          <div className="text-right text-sm text-tinta-suave">
            <p>Emitido el {formatDate(new Date())}</p>
            <p>
              Periodo: {formatDate(periodStart)} – {formatDate(periodEnd)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-tinta-suave">Propietario</p>
          <p className="text-base font-medium text-tinta">{owner.name}</p>
          {owner.email && <p className="text-sm text-tinta-suave">{owner.email}</p>}
          <p className="text-sm text-tinta-suave mt-1">
            Viviendas: {owner.properties.map((p) => p.name).join(", ") || "—"}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {cabecera.map((c) => (
            <div key={c.etiqueta} className="border border-borde rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-tinta-suave">{c.etiqueta}</p>
              <p className="text-base font-semibold text-tinta">{formatCurrency(c.valor)}</p>
            </div>
          ))}
        </div>

        {bookings.length === 0 ? (
          <>
            <h2 className="text-sm font-semibold text-tinta mb-2">Reservas del periodo (0)</h2>
            <p className="text-sm text-tinta-suave mb-6">No hay reservas con entrada en este periodo.</p>
          </>
        ) : (
          gruposDeReservas.map(([clave, grupo]) => {
            const sub = totalesDe(grupo.reservas);
            return (
              <div key={clave} className="mb-5">
                <h2 className="text-sm font-semibold text-tinta mb-2">
                  {gruposDeReservas.length > 1 ? `${grupo.nombre} — reservas` : "Reservas del periodo"}
                  <span className="font-normal text-tinta-suave">
                    {" · "}
                    {grupo.reservas.length}
                    {grupo.reservas.length === 1 ? " reserva" : " reservas"}
                  </span>
                </h2>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Vivienda</th>
                      <th>Huésped</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th>Canal</th>
                      <th>Total</th>
                      <th>Com. plataforma</th>
                      <th>Com. banco</th>
                      <th>A percibir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.reservas.map((b) => (
                      <tr key={b.id}>
                        <td>{b.property.name}</td>
                        <td>{b.guestName}</td>
                        <td>{formatDate(b.checkIn)}</td>
                        <td>{formatDate(b.checkOut)}</td>
                        <td>{b.channel}</td>
                        <td>{formatCurrency(b.totalPrice)}</td>
                        <td>-{formatCurrency(b.platformCommissionAmt)}</td>
                        <td>-{formatCurrency(b.bankCommissionAmt)}</td>
                        <td className="font-medium">{formatCurrency(b.netAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td colSpan={5}>
                        {gruposDeReservas.length > 1 ? `Subtotal · ${grupo.nombre}` : "Totales"}
                      </td>
                      <td>{formatCurrency(sub.total)}</td>
                      <td>-{formatCurrency(sub.platform)}</td>
                      <td>-{formatCurrency(sub.bank)}</td>
                      <td>{formatCurrency(sub.net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })
        )}

        {gruposDeReservas.length > 1 && (
          <table className="table-base mb-2">
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={5}>Total de reservas</td>
                <td>{formatCurrency(totals.total)}</td>
                <td>-{formatCurrency(totals.platform)}</td>
                <td>-{formatCurrency(totals.bank)}</td>
                <td>{formatCurrency(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <h2 className="text-sm font-semibold text-tinta mt-6 mb-2">
          Limpiezas del periodo ({cleaningTasks.length})
        </h2>
        {cleaningTasks.length === 0 ? (
          <p className="text-sm text-tinta-suave mb-6">No hay limpiezas registradas en este periodo.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Vivienda</th>
                <th>Fecha</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {cleaningTasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.property.name}</td>
                  <td>{formatDate(t.date)}</td>
                  <td>{formatCurrency(t.price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={2}>Total limpiezas</td>
                <td>-{formatCurrency(cleaningTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <h2 className="text-sm font-semibold text-tinta mt-6 mb-2">
          Otros gastos del periodo ({expenses.length})
        </h2>
        {expenses.length === 0 ? (
          <p className="text-sm text-tinta-suave mb-6">No hay gastos apuntados en este periodo.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Vivienda</th>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Proveedor</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((g) => (
                <tr key={g.id}>
                  <td>{g.property?.name ?? "—"}</td>
                  <td>{g.date ? formatDate(g.date) : "sin fecha"}</td>
                  <td>{g.concept}</td>
                  <td className="text-tinta-suave">{g.supplier ?? "—"}</td>
                  <td>{formatCurrency(g.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4}>Total gastos</td>
                <td>-{formatCurrency(expensesTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {desglosePorGrupo.length > 1 && (
          <>
            <h2 className="text-sm font-semibold text-tinta mt-6 mb-2">
              Comisión de gestión por grupo
            </h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Ingresos</th>
                  <th>Com. de venta</th>
                  <th>Gastos</th>
                  <th>Base</th>
                  <th>%</th>
                  <th>Comisión</th>
                </tr>
              </thead>
              <tbody>
                {desglosePorGrupo.map((t) => (
                  <tr key={t.nombre}>
                    <td>{t.nombre}</td>
                    <td>{formatCurrency(t.ingresos)}</td>
                    <td>-{formatCurrency(t.comisionesDeVenta)}</td>
                    <td>-{formatCurrency(t.gastos)}</td>
                    <td>{formatCurrency(t.baseDeGestion)}</td>
                    <td>{t.managementPct} %</td>
                    <td className="font-medium">{formatCurrency(t.comisionDeGestion)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={6}>Total comisión de gestión</td>
                  <td>{formatCurrency(liquidacion.comisionDeGestion)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <div className="mt-8 border-t border-borde pt-4 flex justify-end">
          <div className="w-80 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-tinta-suave">Ingresos de las reservas</span>
              <span>{formatCurrency(liquidacion.ingresos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tinta-suave">Comisiones de venta</span>
              <span>-{formatCurrency(liquidacion.comisionesDeVenta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tinta-suave">Limpiezas</span>
              <span>-{formatCurrency(cleaningTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tinta-suave">Otros gastos</span>
              <span>-{formatCurrency(expensesTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-borde pt-1.5">
              <span className="text-tinta-suave">Base de gestión</span>
              <span>{formatCurrency(liquidacion.baseDeGestion)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tinta-suave">Comisión de gestión</span>
              <span>-{formatCurrency(liquidacion.comisionDeGestion)}</span>
            </div>
            {/* Con varios grupos ya está la tabla de arriba: repetirlo aquí
                solo mete tres líneas de letra pequeña. */}
            {desglosePorGrupo.length <= 1 && (
              <p className="text-[11px] text-tinta-suave text-right">
                {liquidacion.detalleDeLaComision}
              </p>
            )}
            <div className="flex justify-between text-base font-semibold border-t border-borde pt-1.5">
              <span>Total a liquidar al propietario</span>
              <span>{formatCurrency(liquidacion.alPropietario)}</span>
            </div>
          </div>
        </div>

        {liquidacion.comisionDeGestion > 0 && (
          <p className="text-[10px] text-tinta-suave mt-8">
            La comisión de gestión se calcula sobre lo que queda después de las comisiones de
            venta, las limpiezas y los gastos del periodo.
          </p>
        )}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintButton, BackButton } from "@/components/ui";
import { formatCurrency, formatDate, round2 } from "@/lib/money";
import { BUSINESS_TYPES } from "@/lib/constants";

/**
 * Informe imprimible de propietario. Compartido por ambos negocios: siempre
 * lee las mismas reservas y las mismas `CleaningTask`, así que el documento es
 * idéntico se pida desde donde se pida. `backHref` solo cambia a qué panel
 * vuelve el botón de "Volver".
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
  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  periodEnd.setHours(23, 59, 59, 999);

  const [owner, rentalBusiness] = await Promise.all([
    prisma.owner.findFirst({
      where: { id: ownerId, organizationId },
      include: { properties: true },
    }),
    prisma.business.findFirst({ where: { organizationId, type: BUSINESS_TYPES.RENTAL_MANAGEMENT } }),
  ]);
  if (!owner) notFound();

  const propertyIds = owner.properties.map((p) => p.id);

  const bookings = await prisma.booking.findMany({
    where: {
      organizationId,
      propertyId: { in: propertyIds },
      status: "CONFIRMED",
      checkIn: { gte: periodStart, lte: periodEnd },
    },
    include: { property: true },
    orderBy: { checkIn: "asc" },
  });

  const cleaningTasks = await prisma.cleaningTask.findMany({
    where: {
      organizationId,
      propertyId: { in: propertyIds },
      type: "CLEANING",
      billable: true,
      date: { gte: periodStart, lte: periodEnd },
    },
    include: { property: true },
    orderBy: { date: "asc" },
  });

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
  const finalNet = round2(totals.net - cleaningTotal);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 no-print">
        <BackButton href={backHref} />
        <PrintButton />
      </div>

      <div className="card print-area p-8">
        <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Informe de propietario</h1>
            <p className="text-sm text-slate-500 mt-1">{rentalBusiness?.legalName ?? rentalBusiness?.name}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Emitido el {formatDate(new Date())}</p>
            <p>
              Periodo: {formatDate(periodStart)} – {formatDate(periodEnd)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-slate-400">Propietario</p>
          <p className="text-base font-medium text-slate-800">{owner.name}</p>
          {owner.email && <p className="text-sm text-slate-500">{owner.email}</p>}
          <p className="text-sm text-slate-500 mt-1">
            Viviendas: {owner.properties.map((p) => p.name).join(", ") || "—"}
          </p>
        </div>

        <h2 className="text-sm font-semibold text-slate-700 mb-2">Reservas del periodo ({bookings.length})</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-400 mb-6">No hay reservas con entrada en este periodo.</p>
        ) : (
          <table className="table-base mb-2">
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
                <th>Neto</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
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
                <td colSpan={5}>Totales</td>
                <td>{formatCurrency(totals.total)}</td>
                <td>-{formatCurrency(totals.platform)}</td>
                <td>-{formatCurrency(totals.bank)}</td>
                <td>{formatCurrency(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <h2 className="text-sm font-semibold text-slate-700 mt-6 mb-2">
          Limpiezas del periodo ({cleaningTasks.length})
        </h2>
        {cleaningTasks.length === 0 ? (
          <p className="text-sm text-slate-400 mb-6">No hay limpiezas registradas en este periodo.</p>
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

        <div className="mt-8 border-t border-slate-200 pt-4 flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Neto de reservas</span>
              <span>{formatCurrency(totals.net)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Limpiezas</span>
              <span>-{formatCurrency(cleaningTotal)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-slate-200 pt-1.5">
              <span>Total a liquidar al propietario</span>
              <span>{formatCurrency(finalNet)}</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 mt-8">
          Informe generado automáticamente. Cifras de ejemplo con fines de demostración.
        </p>
      </div>
    </div>
  );
}

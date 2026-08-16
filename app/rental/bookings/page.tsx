import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/money";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; channel?: string }>;
}) {
  const { organizationId } = await requireBusinessContext();
  const params = await searchParams;

  const properties = await prisma.property.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      organizationId,
      ...(params.propertyId ? { propertyId: params.propertyId } : {}),
      ...(params.channel ? { channel: params.channel } : {}),
    },
    include: { property: true },
    orderBy: { checkIn: "desc" },
  });

  const channels = Array.from(new Set((await prisma.booking.findMany({
    where: { organizationId },
    select: { channel: true },
  })).map((b) => b.channel)));

  return (
    <div>
      <PageHeader
        title="Reservas"
        subtitle={`${bookings.length} reserva(s)`}
        actions={
          <Link href="/rental/bookings/new" className="btn-primary">
            + Nueva reserva
          </Link>
        }
      />

      <form className="card p-3 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Vivienda</label>
          <select name="propertyId" defaultValue={params.propertyId ?? ""} className="input">
            <option value="">Todas</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Canal</label>
          <select name="channel" defaultValue={params.channel ?? ""} className="input">
            <option value="">Todos</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filtrar
        </button>
        {(params.propertyId || params.channel) && (
          <Link href="/rental/bookings" className="text-xs text-slate-500 hover:underline">
            Limpiar filtros
          </Link>
        )}
      </form>

      {bookings.length === 0 ? (
        <EmptyState message="No hay reservas que coincidan con el filtro." />
      ) : (
        <div className="card overflow-x-auto">
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
                <th>Neto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="font-medium text-slate-700">{b.property.name}</td>
                  <td>{b.guestName}</td>
                  <td>{formatDate(b.checkIn)}</td>
                  <td>{formatDate(b.checkOut)}</td>
                  <td>
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200">{b.channel}</Badge>
                  </td>
                  <td>{formatCurrency(b.totalPrice)}</td>
                  <td className="text-rose-600">-{formatCurrency(b.platformCommissionAmt)}</td>
                  <td className="text-rose-600">-{formatCurrency(b.bankCommissionAmt)}</td>
                  <td className="font-semibold text-green-700">{formatCurrency(b.netAmount)}</td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      {b.manuallyAdjusted && <span title="Ajustada manualmente">🔒</span>}
                      <Link href={`/rental/bookings/${b.id}`} className="text-xs text-brand-700 hover:underline">
                        Editar
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

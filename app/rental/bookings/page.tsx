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
  const { organizationId } = await requireBusinessContext("operativa.alquiler");
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
        subtitle={
          bookings.length === 1 ? "1 reserva" : `${bookings.length} reservas`
        }
        actions={
          <Link href="/rental/bookings/new" className="btn-primary">
            + Nueva reserva
          </Link>
        }
      />

      <form className="card p-4 mb-5 flex flex-wrap gap-4 items-end">
        <div className="min-w-[12rem]">
          <label className="label" htmlFor="filtro-vivienda">
            Vivienda
          </label>
          <select
            id="filtro-vivienda"
            name="propertyId"
            defaultValue={params.propertyId ?? ""}
            className="input"
          >
            <option value="">Todas</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[10rem]">
          <label className="label" htmlFor="filtro-canal">
            Canal
          </label>
          <select id="filtro-canal" name="channel" defaultValue={params.channel ?? ""} className="input">
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
          <Link href="/rental/bookings" className="btn-fantasma text-xs">
            Quitar filtros
          </Link>
        )}
      </form>

      {bookings.length === 0 ? (
        <EmptyState
          icono="reservas"
          message={
            params.propertyId || params.channel
              ? "Ninguna reserva coincide con el filtro. Prueba a quitarlo."
              : "Todavía no hay reservas. Las de Lodgify entran solas con la sincronización; las demás se añaden a mano."
          }
          accion={{ href: "/rental/bookings/new", label: "Nueva reserva" }}
        />
      ) : (
        <div className="card overflow-x-auto">
          {/* En pantallas estrechas se esconden las dos columnas de comisión:
              lo que se viene a mirar aquí es quién entra, cuándo y cuánto
              queda. El desglose completo está en la ficha de cada reserva. */}
          <table className="table-base min-w-[46rem]">
            <thead>
              <tr>
                <th>Vivienda</th>
                <th>Huésped</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th className="hidden sm:table-cell">Canal</th>
                <th className="num">Total</th>
                <th className="num hidden xl:table-cell">Com. plataforma</th>
                <th className="num hidden xl:table-cell">Com. banco</th>
                <th className="num">Neto</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="font-medium text-tinta">{b.property.name}</td>
                  <td>{b.guestName}</td>
                  <td>{formatDate(b.checkIn)}</td>
                  <td>{formatDate(b.checkOut)}</td>
                  <td className="hidden sm:table-cell">
                    <Badge tono="neutro">{b.channel}</Badge>
                  </td>
                  <td className="num">{formatCurrency(b.totalPrice)}</td>
                  <td className="num hidden xl:table-cell text-tinta-suave">
                    −{formatCurrency(b.platformCommissionAmt)}
                  </td>
                  <td className="num hidden xl:table-cell text-tinta-suave">
                    −{formatCurrency(b.bankCommissionAmt)}
                  </td>
                  <td className="num font-semibold text-tinta">{formatCurrency(b.netAmount)}</td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      {b.manuallyAdjusted && (
                        <Badge tono="aviso">
                          <span className="sr-only">Reserva </span>ajustada a mano
                        </Badge>
                      )}
                      <Link href={`/rental/bookings/${b.id}`} className="enlace text-xs">
                        Editar
                        <span className="sr-only"> la reserva de {b.guestName}</span>
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

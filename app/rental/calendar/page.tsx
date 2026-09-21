import Link from "next/link";
import { addDays, addWeeks, startOfWeek, isSameDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/money";
import { casillaDelDia } from "@/lib/calendario";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/*
 * Antes cada vivienda tenía un color distinto (ocho, del violeta al lima). En
 * una tabla donde cada fila ya lleva el nombre de la vivienda, ese arcoíris no
 * distinguía nada que no se leyera antes, y competía con lo único que aquí
 * importa: qué días están ocupados y dónde hay entrada o salida.
 *
 * Ahora la ocupación es de un solo color, el azul de la casa, y lo que cambia
 * de tono es el tipo de día.
 */
const DIA_OCUPADO = "bg-oceano-suave border-[#d3e3ef] text-marina";
const DIA_ENTRADA = "bg-oceano-suave border-oceano text-marina";
const DIA_SALIDA = "bg-acento-suave border-[#f6e0c4] text-acento-texto";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");
  const params = await searchParams;
  // Acotado: `?week=999999999` desbordaba la fecha y la página reventaba con
  // «Invalid time value». Diez años arriba y abajo sobran de largo.
  const MAX_SEMANAS = 520;
  const pedido = Number(params.week ?? "0") || 0;
  const weekOffset = Math.max(-MAX_SEMANAS, Math.min(MAX_SEMANAS, Math.trunc(pedido)));

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const [properties, bookings] = await Promise.all([
    prisma.property.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({
      where: {
        organizationId,
        status: "CONFIRMED",
        checkIn: { lt: weekEnd },
        checkOut: { gt: weekStart },
      },
      include: { property: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Calendario semanal de ocupación"
        subtitle={`${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/rental/calendar?week=${weekOffset - 1}`} className="btn-secondary">← Semana anterior</Link>
            <Link href="/rental/calendar?week=0" className="btn-secondary">Hoy</Link>
            <Link href={`/rental/calendar?week=${weekOffset + 1}`} className="btn-secondary">Semana siguiente →</Link>
          </div>
        }
      />

      {properties.length === 0 ? (
        <EmptyState
          icono="casa"
          message="No hay viviendas activas todavía, así que no hay nada que ocupar."
          accion={{ href: "/rental/properties", label: "Ver viviendas" }}
        />
      ) : (
        <>
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 min-w-[180px]">Vivienda</th>
                {weekDays.map((d) => (
                  <th
                    key={d.toISOString()}
                    aria-current={isSameDay(d, new Date()) ? "date" : undefined}
                    className={isSameDay(d, new Date()) ? "bg-arena text-marina" : ""}
                  >
                    {DAY_LABELS[(d.getDay() + 6) % 7]} {formatDate(d)}
                    {isSameDay(d, new Date()) && <span className="sr-only"> (hoy)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => {
                const propBookings = bookings.filter((b) => b.propertyId === property.id);
                return (
                  <tr key={property.id}>
                    <td className="sticky left-0 bg-white z-10 font-medium text-tinta">
                      <Link href={`/rental/properties`} className="hover:underline">
                        {property.name}
                      </Link>
                      <p className="text-xs text-tinta-suave font-normal">{property.locality}</p>
                    </td>
                    {weekDays.map((day) => {
                      // La decisión de qué va en cada casilla vive en
                      // `lib/calendario.ts`, para poder probarla.
                      const { reserva: booking, esEntrada, esSalida, etiqueta } = casillaDelDia(
                        propBookings,
                        day
                      );
                      return (
                        <td
                          key={day.toISOString()}
                          className={`p-1.5 ${isSameDay(day, new Date()) ? "bg-arena" : ""}`}
                        >
                          {booking ? (
                            <Link
                              href={`/rental/bookings/${booking.id}`}
                              className={`block rounded-md border px-2 py-1.5 text-xs transition-shadow hover:shadow-sm ${
                                // La salida manda sobre la entrada: es el día
                                // que obliga a mandar a alguien a limpiar.
                                esSalida ? DIA_SALIDA : esEntrada ? DIA_ENTRADA : DIA_OCUPADO
                              }`}
                              title={`${booking.guestName} (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)})`}
                            >
                              <p className="font-medium truncate">{booking.guestName}</p>
                              <p className="truncate">{etiqueta}</p>
                            </Link>
                          ) : (
                            <div className="h-10 rounded-md border border-dashed border-borde" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-tinta-suave">
          <li className="flex items-center gap-2">
            <span aria-hidden className={`h-3.5 w-3.5 rounded border ${DIA_ENTRADA}`} />
            Día de entrada
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className={`h-3.5 w-3.5 rounded border ${DIA_OCUPADO}`} />
            Noche ocupada
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className={`h-3.5 w-3.5 rounded border ${DIA_SALIDA}`} />
            Salida · deja limpieza
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3.5 w-3.5 rounded border border-dashed border-borde-fuerte" />
            Libre
          </li>
        </ul>
        </>
      )}
    </div>
  );
}

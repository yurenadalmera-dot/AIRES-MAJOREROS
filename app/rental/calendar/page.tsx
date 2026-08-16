import Link from "next/link";
import { addDays, addWeeks, startOfWeek, isSameDay, isWithinInterval, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/money";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Paleta estable por vivienda para diferenciar reservas de un vistazo.
const COLOR_CLASSES = [
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-cyan-100 text-cyan-800 border-cyan-300",
  "bg-lime-100 text-lime-800 border-lime-300",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { organizationId } = await requireBusinessContext();
  const params = await searchParams;
  const weekOffset = Number(params.week ?? "0") || 0;

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
        <EmptyState message="No hay viviendas activas todavía." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 min-w-[180px]">Vivienda</th>
                {weekDays.map((d) => (
                  <th key={d.toISOString()} className={isSameDay(d, new Date()) ? "text-brand-700" : ""}>
                    {DAY_LABELS[(d.getDay() + 6) % 7]} {formatDate(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {properties.map((property, pIdx) => {
                const propBookings = bookings.filter((b) => b.propertyId === property.id);
                const colorClass = COLOR_CLASSES[pIdx % COLOR_CLASSES.length];
                return (
                  <tr key={property.id}>
                    <td className="sticky left-0 bg-white z-10 font-medium text-slate-700">
                      <Link href={`/rental/properties`} className="hover:underline">
                        {property.name}
                      </Link>
                      <p className="text-xs text-slate-400 font-normal">{property.locality}</p>
                    </td>
                    {weekDays.map((day) => {
                      const dayStart = startOfDay(day);
                      const booking = propBookings.find((b) =>
                        isWithinInterval(dayStart, {
                          start: startOfDay(b.checkIn),
                          end: addDays(startOfDay(b.checkOut), -1) < startOfDay(b.checkIn)
                            ? startOfDay(b.checkIn)
                            : addDays(startOfDay(b.checkOut), -1),
                        })
                      );
                      const isCheckIn = booking && isSameDay(booking.checkIn, day);
                      const isCheckOut = booking && isSameDay(booking.checkOut, day);
                      return (
                        <td key={day.toISOString()} className="p-1.5">
                          {booking ? (
                            <Link
                              href={`/rental/bookings/${booking.id}`}
                              className={`block rounded-md border px-2 py-1.5 text-xs ${colorClass}`}
                              title={`${booking.guestName} (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)})`}
                            >
                              <p className="font-medium truncate">{booking.guestName}</p>
                              <p className="truncate opacity-75">
                                {isCheckIn ? "Entrada" : isCheckOut ? "Salida" : "—"}
                              </p>
                            </Link>
                          ) : (
                            <div className="h-10 rounded-md border border-dashed border-slate-200" />
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
      )}
    </div>
  );
}

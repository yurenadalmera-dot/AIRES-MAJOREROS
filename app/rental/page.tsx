import Link from "next/link";
import { startOfDay, endOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatDateLong } from "@/lib/money";
import { computePropertyStatus } from "@/lib/status";
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";

export default async function RentalDashboardPage() {
  const { organizationId } = await requireBusinessContext();

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const [checkIns, checkOuts, allProperties, allBookingsToday, allTasksToday, pendingCleaningTasks] =
    await Promise.all([
      prisma.booking.findMany({
        where: { organizationId, status: "CONFIRMED", checkIn: { gte: todayStart, lte: todayEnd } },
        include: { property: true },
        orderBy: { property: { name: "asc" } },
      }),
      prisma.booking.findMany({
        where: { organizationId, status: "CONFIRMED", checkOut: { gte: todayStart, lte: todayEnd } },
        include: { property: true },
        orderBy: { property: { name: "asc" } },
      }),
      prisma.property.findMany({ where: { organizationId, active: true }, include: { owner: true } }),
      prisma.booking.findMany({ where: { organizationId, status: "CONFIRMED" } }),
      prisma.cleaningTask.findMany({ where: { organizationId } }),
      prisma.cleaningTask.findMany({
        where: { organizationId, type: "CLEANING", status: { in: ["PENDING", "IN_PROGRESS"] } },
        include: { property: true },
      }),
    ]);

  const statuses = allProperties.map((p) =>
    computePropertyStatus(
      p.manualStatus,
      allBookingsToday.filter((b) => b.propertyId === p.id),
      allTasksToday.filter((t) => t.propertyId === p.id)
    )
  );
  const occupiedCount = statuses.filter((s) => s === "OCCUPIED").length;
  const cleaningNeededCount = statuses.filter((s) => s === "CLEANING_NEEDED").length;
  const availableCount = statuses.filter((s) => s === "AVAILABLE").length;

  return (
    <div>
      <PageHeader
        title="Panel del día"
        subtitle={formatDateLong(today)}
        actions={
          <Link href="/rental/bookings/new" className="btn-primary">
            + Nueva reserva
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Viviendas activas" value={allProperties.length} />
        <StatCard label="Ocupadas hoy" value={occupiedCount} tone="default" />
        <StatCard label="Libres hoy" value={availableCount} tone="good" />
        <StatCard
          label="Limpiezas pendientes"
          value={pendingCleaningTasks.length}
          tone={pendingCleaningTasks.length > 0 ? "warn" : "good"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-4">
          <h2 className="font-medium text-slate-800 mb-3">🟢 Entradas de hoy ({checkIns.length})</h2>
          {checkIns.length === 0 ? (
            <EmptyState message="No hay entradas previstas para hoy." />
          ) : (
            <ul className="space-y-2">
              {checkIns.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{b.property.name}</p>
                    <p className="text-xs text-slate-500">
                      {b.guestName} · {b.adults} adultos{b.children ? ` · ${b.children} niños` : ""} · {b.channel}
                    </p>
                  </div>
                  <Link href={`/rental/bookings/${b.id}`} className="text-xs text-brand-700 hover:underline">
                    Ver reserva →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-medium text-slate-800 mb-3">🔴 Salidas de hoy ({checkOuts.length})</h2>
          {checkOuts.length === 0 ? (
            <EmptyState message="No hay salidas previstas para hoy." />
          ) : (
            <ul className="space-y-2">
              {checkOuts.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{b.property.name}</p>
                    <p className="text-xs text-slate-500">{b.guestName} · {b.channel}</p>
                  </div>
                  <Link href={`/rental/bookings/${b.id}`} className="text-xs text-brand-700 hover:underline">
                    Ver reserva →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-slate-800">Estado de viviendas</h2>
          <Link href="/rental/properties" className="text-xs text-brand-700 hover:underline">
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allProperties.map((p, i) => (
            <div key={p.id} className="rounded-lg border border-slate-100 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                <Badge className={PROPERTY_STATUS_COLOR[statuses[i]]}>{PROPERTY_STATUS_LABEL[statuses[i]]}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{p.locality}{p.owner ? ` · ${p.owner.name}` : ""}</p>
            </div>
          ))}
        </div>
      </div>

      {cleaningNeededCount > 0 && (
        <p className="text-xs text-amber-700 mt-4">
          ⚠️ Hay {cleaningNeededCount} vivienda(s) con salida hoy que necesitan limpieza. Revisa el{" "}
          <Link href="/rental/tasks" className="underline">tablero de tareas</Link>.
        </p>
      )}
    </div>
  );
}

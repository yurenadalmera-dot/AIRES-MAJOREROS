import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { computePropertyStatus } from "@/lib/status";
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_COLOR } from "@/lib/constants";
import { formatCurrency } from "@/lib/money";
import { startOfDay, endOfDay } from "date-fns";

export default async function PropertiesPage() {
  const { organizationId } = await requireBusinessContext();
  const today = new Date();

  const [properties, todaysBookings, todaysTasks] = await Promise.all([
    prisma.property.findMany({ where: { organizationId }, include: { owner: true }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({
      where: {
        organizationId,
        status: "CONFIRMED",
        checkIn: { lte: endOfDay(today) },
        checkOut: { gte: startOfDay(today) },
      },
    }),
    prisma.cleaningTask.findMany({ where: { organizationId } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Viviendas"
        subtitle={`${properties.length} vivienda(s)`}
        actions={
          <Link href="/rental/properties/new" className="btn-primary">
            + Nueva vivienda
          </Link>
        }
      />

      {properties.length === 0 ? (
        <EmptyState message="Todavía no hay viviendas registradas." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((p) => {
            const status = computePropertyStatus(
              p.manualStatus,
              todaysBookings.filter((b) => b.propertyId === p.id),
              todaysTasks.filter((t) => t.propertyId === p.id)
            );
            return (
              <Link key={p.id} href={`/rental/properties/${p.id}`} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.locality}</p>
                  </div>
                  {!p.active && <Badge className="bg-slate-200 text-slate-600 border-slate-300">Inactiva</Badge>}
                </div>
                <div className="mt-3">
                  <Badge className={PROPERTY_STATUS_COLOR[status]}>{PROPERTY_STATUS_LABEL[status]}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-slate-500">
                  <dt>Capacidad</dt>
                  <dd className="text-right text-slate-700">{p.capacity} pers.</dd>
                  <dt>Hab. / baños</dt>
                  <dd className="text-right text-slate-700">{p.bedrooms} / {p.bathrooms}</dd>
                  <dt>Precio limpieza</dt>
                  <dd className="text-right text-slate-700">{formatCurrency(p.cleaningPrice)}</dd>
                  <dt>Propietario</dt>
                  <dd className="text-right text-slate-700 truncate">{p.owner?.name ?? "—"}</dd>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

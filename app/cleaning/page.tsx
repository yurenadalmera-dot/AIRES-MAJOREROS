import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate, round2 } from "@/lib/money";
import { BUSINESS_TYPES } from "@/lib/constants";
import GenerateInvoiceForm from "@/components/GenerateInvoiceForm";
import { format } from "date-fns";

export default async function CleaningBillingPage() {
  const { organizationId } = await requireBusinessContext();

  const [pendingTasks, rentalBusiness] = await Promise.all([
    prisma.cleaningTask.findMany({
      where: { organizationId, type: "CLEANING", billable: true, status: "DONE", invoiceId: null },
      include: { property: true, employee: true },
      orderBy: { date: "asc" },
    }),
    prisma.business.findFirst({ where: { organizationId, type: BUSINESS_TYPES.RENTAL_MANAGEMENT } }),
  ]);

  const total = round2(pendingTasks.reduce((sum, t) => sum + Number(t.price), 0));
  const dates = pendingTasks.map((t) => t.date);
  const minDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
  const maxDate = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();

  return (
    <div>
      <PageHeader
        title="Facturación"
        subtitle="Limpiezas ya realizadas y todavía sin facturar. Este listado se alimenta automáticamente de la operativa — es el mismo registro, sin duplicarse."
        actions={
          <Link href="/cleaning/tasks" className="btn-secondary">
            🧹 Ver tablero de tareas
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Limpiezas pendientes de facturar" value={pendingTasks.length} />
        <StatCard label="Importe pendiente" value={formatCurrency(total)} tone={total > 0 ? "warn" : "good"} />
        <StatCard label="Cliente habitual" value={rentalBusiness?.name ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {pendingTasks.length === 0 ? (
            <EmptyState message="No hay limpiezas pendientes de facturar." />
          ) : (
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Vivienda</th>
                    <th>Empleada</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTasks.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDate(t.date)}</td>
                      <td className="font-medium text-slate-700">{t.property.name}</td>
                      <td>{t.employee?.name ?? "—"}</td>
                      <td>{formatCurrency(t.price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3}>Total pendiente</td>
                    <td>{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div>
          <GenerateInvoiceForm
            defaultBilledToName={rentalBusiness?.legalName ?? rentalBusiness?.name ?? ""}
            defaultBilledToTaxId={rentalBusiness?.taxId ?? ""}
            defaultStart={format(minDate, "yyyy-MM-dd")}
            defaultEnd={format(maxDate, "yyyy-MM-dd")}
            disabled={pendingTasks.length === 0}
          />
        </div>
      </div>
    </div>
  );
}

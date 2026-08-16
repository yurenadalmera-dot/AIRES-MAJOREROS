import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/ui";
import TaskRow from "@/components/TaskRow";
import { createMaintenanceTask } from "@/lib/actions/tasks";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { organizationId } = await requireBusinessContext();
  const params = await searchParams;

  const [tasks, employees, properties] = await Promise.all([
    prisma.cleaningTask.findMany({
      where: {
        organizationId,
        ...(params.type ? { type: params.type } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: { property: true },
      orderBy: { date: "asc" },
    }),
    prisma.employee.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
    prisma.property.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Limpieza y mantenimiento"
        subtitle="Asignación de tareas a empleadas. Las limpiezas hechas alimentan automáticamente la facturación de Aires Majoreros."
      />

      <details className="card p-4 mb-4 no-print">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Nueva tarea de mantenimiento</summary>
        <form action={createMaintenanceTask} className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Vivienda</label>
            <select name="propertyId" required className="input">
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha</label>
            <input type="date" name="date" required className="input" />
          </div>
          <div>
            <label className="label">Empleada (opcional)</label>
            <select name="employeeId" className="input">
              <option value="">Sin asignar</option>
              {employees
                .filter((e) => e.role !== "CLEANING")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Descripción</label>
            <input name="notes" required placeholder="p.ej. Revisar fontanería" className="input" />
          </div>
          <div className="md:col-span-4">
            <button type="submit" className="btn-primary">
              Crear tarea
            </button>
          </div>
        </form>
      </details>

      <form className="card p-3 mb-4 flex flex-wrap gap-3 items-end no-print">
        <div>
          <label className="label">Tipo</label>
          <select name="type" defaultValue={params.type ?? ""} className="input">
            <option value="">Todos</option>
            <option value="CLEANING">Limpieza</option>
            <option value="MAINTENANCE">Mantenimiento</option>
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <select name="status" defaultValue={params.status ?? ""} className="input">
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="IN_PROGRESS">En curso</option>
            <option value="DONE">Hecha</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filtrar
        </button>
      </form>

      {tasks.length === 0 ? (
        <EmptyState message="No hay tareas que coincidan con el filtro." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vivienda</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Empleada</th>
                <th>Importe</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={{
                    id: t.id,
                    type: t.type,
                    date: t.date.toISOString(),
                    status: t.status,
                    billable: t.billable,
                    price: Number(t.price),
                    invoiced: !!t.invoiceId,
                    notes: t.notes,
                    employeeId: t.employeeId,
                    propertyName: t.property.name,
                  }}
                  employees={employees}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

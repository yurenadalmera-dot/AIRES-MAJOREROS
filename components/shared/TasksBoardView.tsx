import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import TaskRow from "@/components/TaskRow";
import { createMaintenanceTask } from "@/lib/actions/tasks";
import NuevaLimpieza from "@/components/NuevaLimpieza";
import FormularioConAviso from "@/components/FormularioConAviso";

/**
 * Tablero de tareas, con un `tipo` fijo según quién lo abre.
 *
 * Antes las dos pantallas eran literalmente la misma, con distinto subtítulo:
 * las limpiezas y los mantenimientos mezclados en las dos. Pero no son el
 * mismo negocio. **Las limpiezas son de Aires Majoreros**, que las hace y las
 * factura; **el mantenimiento es de la operativa de alquiler**, que es quien
 * llama al fontanero.
 *
 * Emma no se queda ciega respecto a las limpiezas: el panel del día le sigue
 * diciendo qué vivienda tiene salida hoy y no está limpia, porque es ella
 * quien da la cara con el huésped que llega. Lo que ya no hace es gestionarlas.
 *
 * Sigue leyendo de la misma tabla `CleaningTask`: un solo registro, dos
 * vistas. Al marcar una limpieza como hecha pasa sola a facturación.
 */
export default async function TasksBoardView({
  organizationId,
  params,
  tipo,
  titulo,
  subtitle,
}: {
  organizationId: string;
  params: { status?: string };
  /** CLEANING o MAINTENANCE: esta pantalla solo enseña uno. */
  tipo: "CLEANING" | "MAINTENANCE";
  titulo: string;
  subtitle: string;
}) {
  const [tasks, employees, properties] = await Promise.all([
    prisma.cleaningTask.findMany({
      where: {
        organizationId,
        type: tipo,
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
      <PageHeader title={titulo} subtitle={subtitle} />

      {tipo === "CLEANING" && <NuevaLimpieza viviendas={properties} empleadas={employees} />}

      <details className={`card p-4 mb-4 no-print ${tipo === "CLEANING" ? "hidden" : ""}`}>
        <summary className="cursor-pointer text-sm font-medium text-tinta">
          + Nueva tarea de mantenimiento
        </summary>
        <FormularioConAviso action={createMaintenanceTask} className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
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
        </FormularioConAviso>
      </details>

      {/* El formulario de filtro es un GET sin action explícita: se envía a la
          ruta actual, así funciona igual desde /rental/tasks y /cleaning/tasks. */}
      <form className="card p-3 mb-4 flex flex-wrap gap-3 items-end no-print">
        <div>
          <label className="label" htmlFor="filtro-estado">
            Estado
          </label>
          <select id="filtro-estado" name="status" defaultValue={params.status ?? ""} className="input">
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
        <EmptyState
          icono={tipo === "CLEANING" ? "limpieza" : "ajustes"}
          message={
            params.status
              ? "Ninguna tarea coincide con ese estado."
              : tipo === "CLEANING"
                ? "No hay limpiezas apuntadas. Cada salida genera la suya sola al sincronizar con Lodgify."
                : "No hay tareas de mantenimiento apuntadas."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vivienda</th>
                <th>{tipo === "CLEANING" ? "Servicio" : "Tipo"}</th>
                {tipo === "CLEANING" && <th className="num">Huéspedes</th>}
                <th>Estado</th>
                <th>Empleada</th>
                <th className="num">Importe</th>
                <th>Notas</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
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
                    servicio: t.servicio,
                    huespedes: t.huespedes,
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

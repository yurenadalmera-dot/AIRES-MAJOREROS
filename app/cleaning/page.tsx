import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, StatCard, EmptyState, Aviso } from "@/components/ui";
import { formatCurrency, formatDate, round2 } from "@/lib/money";
import GenerateInvoiceForm from "@/components/GenerateInvoiceForm";
import { format } from "date-fns";

export default async function CleaningBillingPage() {
  const { organizationId } = await requireBusinessContext("facturacion");

  const pendingTasks = await prisma.cleaningTask.findMany({
    where: { organizationId, type: "CLEANING", billable: true, status: "DONE", invoiceId: null },
    include: { property: { include: { owner: true } }, employee: true },
    orderBy: { date: "asc" },
  });

  const total = round2(pendingTasks.reduce((sum, t) => sum + Number(t.price), 0));

  // Agrupadas por propietario, que es como se factura: los clientes de Aires
  // Majoreros son los propietarios de las viviendas, y cada uno recibe su
  // propio documento con el detalle de las suyas.
  const porPropietario = new Map<
    string,
    { nombre: string; documento: string; completo: boolean; tareas: typeof pendingTasks }
  >();
  for (const t of pendingTasks) {
    const o = t.property.owner;
    const clave = o?.id ?? "__sin__";
    const grupo = porPropietario.get(clave) ?? {
      nombre: o?.name ?? "Sin propietario asignado",
      documento: o?.documentoLimpieza ?? "FACTURA",
      // Una factura sin NIF ni domicilio del cliente no es válida.
      completo: o ? Boolean(o.taxId && o.address) || o.documentoLimpieza === "RESUMEN" : false,
      tareas: [],
    };
    grupo.tareas.push(t);
    porPropietario.set(clave, grupo);
  }
  const grupos = [...porPropietario.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sumaDe = (ts: typeof pendingTasks) => round2(ts.reduce((s, t) => s + Number(t.price), 0));
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
            Ver tablero de tareas
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Limpiezas pendientes de facturar" value={pendingTasks.length} />
        <StatCard label="Importe pendiente" value={formatCurrency(total)} tone={total > 0 ? "warn" : "good"} />
        <StatCard
          label="Propietarios a facturar"
          value={grupos.length}
          hint="Un documento por cada uno"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {pendingTasks.length === 0 ? (
            <EmptyState
              icono="euro"
              message="No hay limpiezas pendientes de facturar. Aquí entran solas en cuanto se marcan como hechas en el tablero."
              accion={{ href: "/cleaning/tasks", label: "Ir al tablero" }}
            />
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => (
                <div key={g.nombre} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-tinta">{g.nombre}</p>
                      <p className="text-xs text-tinta-suave">
                        {g.tareas.length} {g.tareas.length === 1 ? "limpieza" : "limpiezas"} ·{" "}
                        {g.documento === "RESUMEN" ? "recibe resumen" : "recibe factura"}
                      </p>
                    </div>
                    <p className="cifra text-lg font-semibold text-tinta">
                      {formatCurrency(sumaDe(g.tareas))}
                    </p>
                  </div>

                  {!g.completo && (
                    <div className="px-4 pt-3">
                      <Aviso>
                        {g.nombre === "Sin propietario asignado"
                          ? "Estas viviendas no tienen propietario, así que no se sabe a quién facturarlas. Asígnaselo en Viviendas."
                          : "Le faltan el NIF o el domicilio, y sin eso la factura no sería válida. Complétalo en Ajustes antes de emitir."}
                      </Aviso>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Vivienda</th>
                          <th>Servicio</th>
                          <th className="num">Huéspedes</th>
                          <th>Empleada</th>
                          <th className="num">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.tareas.map((t) => (
                          <tr key={t.id}>
                            <td>{formatDate(t.date)}</td>
                            <td className="font-medium text-tinta">{t.property.name}</td>
                            <td>{t.servicio === "repaso" ? "Repaso" : "Salida"}</td>
                            <td className="num">{t.huespedes ?? "—"}</td>
                            <td className="text-tinta-suave">{t.employee?.name ?? "—"}</td>
                            <td className="num">{formatCurrency(t.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <GenerateInvoiceForm
            defaultStart={format(minDate, "yyyy-MM-dd")}
            defaultEnd={format(maxDate, "yyyy-MM-dd")}
            disabled={pendingTasks.length === 0}
          />
        </div>
      </div>
    </div>
  );
}

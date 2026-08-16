import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge } from "@/components/ui";
import { updateLodgifySettings, updateBusinessInfo } from "@/lib/actions/settings";
import { createEmployee, setEmployeeActive, createOwner } from "@/lib/actions/properties";
import { BUSINESS_TYPES, EMPLOYEE_ROLE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/money";
import SyncLodgifyButton from "@/components/SyncLodgifyButton";

export default async function RentalSettingsPage() {
  const { organizationId } = await requireBusinessContext();

  const [business, integration, employees, owners] = await Promise.all([
    prisma.business.findFirst({ where: { organizationId, type: BUSINESS_TYPES.RENTAL_MANAGEMENT } }),
    prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    }),
    prisma.employee.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);

  async function businessAction(formData: FormData) {
    "use server";
    if (business) await updateBusinessInfo(business.id, formData);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Ajustes" subtitle="Integración con Lodgify, comisiones, empleadas y propietarios" />

      <div className="card p-5">
        <h2 className="font-medium text-slate-800 mb-1">Integración con Lodgify</h2>
        <p className="text-xs text-slate-500 mb-4">
          Lodgify no desglosa la comisión de plataforma ni la bancaria: se calculan automáticamente aplicando estos
          porcentajes sobre el precio total de cada reserva sincronizada. Una reserva ajustada manualmente nunca se
          sobrescribe.
        </p>
        <form action={updateLodgifySettings} className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Comisión de plataforma por defecto (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                name="defaultPlatformPct"
                defaultValue={integration ? Number(integration.defaultPlatformPct) : 15}
                className="input"
              />
            </div>
            <div>
              <label className="label">Comisión bancaria por defecto (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                name="defaultBankPct"
                defaultValue={integration ? Number(integration.defaultBankPct) : 2.5}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">Clave de API de Lodgify (opcional)</label>
            <input name="apiKey" type="password" placeholder="Déjalo vacío para seguir en modo demo" className="input" />
            <p className="text-xs text-slate-400 mt-1">
              Solo se guarda una versión enmascarada; la clave real se lee de la variable de entorno{" "}
              <code>LODGIFY_API_KEY</code> en el servidor.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="syncEnabled" defaultChecked={integration?.syncEnabled ?? true} />
            Sincronización activa
          </label>
          <button type="submit" className="btn-secondary">
            Guardar ajustes de integración
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <SyncLodgifyButton />
          {integration?.lastSyncAt && (
            <p className="text-xs text-slate-400 mt-2">Última sincronización: {formatDate(integration.lastSyncAt)}</p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-slate-800 mb-3">Empleadas</h2>
        <div className="space-y-2 mb-4">
          {employees.map((e) => {
            async function toggleAction(formData: FormData) {
              "use server";
              await setEmployeeActive(e.id, formData.get("active") === "true");
            }
            return (
              <div key={e.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">{e.name}</p>
                  <p className="text-xs text-slate-400">{EMPLOYEE_ROLE_LABEL[e.role]} {e.phone ? `· ${e.phone}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={e.active ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                    {e.active ? "Activa" : "Inactiva"}
                  </Badge>
                  <form action={toggleAction}>
                    <input type="hidden" name="active" value={(!e.active).toString()} />
                    <button type="submit" className="text-xs text-slate-500 hover:underline">
                      {e.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-brand-700">+ Añadir empleada</summary>
          <form action={createEmployee} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="label">Nombre</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">Rol</label>
              <select name="role" defaultValue="CLEANING" className="input">
                <option value="CLEANING">Limpieza</option>
                <option value="MAINTENANCE">Mantenimiento</option>
                <option value="BOTH">Limpieza y mantenimiento</option>
              </select>
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input name="phone" className="input" />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-secondary">
                Añadir
              </button>
            </div>
          </form>
        </details>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-slate-800 mb-3">Propietarios</h2>
        <div className="space-y-2 mb-4">
          {owners.map((o) => (
            <div key={o.id} className="border border-slate-100 rounded-lg px-3 py-2">
              <p className="text-sm font-medium text-slate-700">{o.name}</p>
              <p className="text-xs text-slate-400">{o.email ?? "—"} {o.phone ? `· ${o.phone}` : ""}</p>
            </div>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-brand-700">+ Añadir propietario</summary>
          <form action={createOwner} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="label">Nombre</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" className="input" />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input name="phone" className="input" />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-secondary">
                Añadir
              </button>
            </div>
          </form>
        </details>
      </div>

      {business && (
        <div className="card p-5">
          <h2 className="font-medium text-slate-800 mb-3">Datos del negocio de alquiler</h2>
          <form action={businessAction} className="space-y-3">
            <div>
              <label className="label">Nombre visible</label>
              <input name="name" defaultValue={business.name} required className="input" />
            </div>
            <div>
              <label className="label">Razón social / nombre fiscal</label>
              <input name="legalName" defaultValue={business.legalName ?? ""} className="input" />
            </div>
            <div>
              <label className="label">NIF/CIF</label>
              <input name="taxId" defaultValue={business.taxId ?? ""} className="input" placeholder="Configura el real antes de un uso real" />
            </div>
            <button type="submit" className="btn-primary">
              Guardar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

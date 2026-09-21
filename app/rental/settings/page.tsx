import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge } from "@/components/ui";
import { updateLodgifySettings, updateBusinessInfo, updateOcrSettings } from "@/lib/actions/settings";
import { createEmployee, setEmployeeActive, createOwner } from "@/lib/actions/properties";
import { BUSINESS_TYPES, EMPLOYEE_ROLE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/money";
import SyncLodgifyButton from "@/components/SyncLodgifyButton";
import TokenDeImportacion from "@/components/TokenDeImportacion";
import FormularioConAviso from "@/components/FormularioConAviso";
import GestionUsuarios from "@/components/GestionUsuarios";
import EmpezarDeCero from "@/components/EmpezarDeCero";
import ComisionesPorCanal from "@/components/ComisionesPorCanal";
import GruposDePropietario from "@/components/GruposDePropietario";
import { hayDatosDeDemostracion, resumenDeDatos } from "@/lib/datos-demo";

export default async function RentalSettingsPage() {
  const { organizationId, session } = await requireBusinessContext("administracion");

  const usuarios = (
    await prisma.user.findMany({
      where: { organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, active: true },
    })
  ).map((u) => ({ ...u, esYo: u.id === session.userId }));

  const [resumen, esDemostracion] = await Promise.all([
    resumenDeDatos(organizationId),
    hayDatosDeDemostracion(organizationId),
  ]);

  const comisionesCanal = (
    await prisma.channelCommission.findMany({
      where: { organizationId },
      orderBy: [{ channel: "asc" }, { propertyId: "asc" }],
      include: { property: { select: { name: true } } },
    })
  ).map((c) => ({
    id: c.id,
    channel: c.channel,
    platformPct: Number(c.platformPct),
    bankPct: c.bankPct === null ? null : Number(c.bankPct),
    propertyId: c.propertyId,
    propertyName: c.property?.name ?? null,
    confirmado: c.confirmado,
    nota: c.nota,
  }));

  const propietariosConGrupos = (
    await prisma.owner.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: {
        groups: {
          orderBy: { name: "asc" },
          include: { _count: { select: { properties: true } } },
        },
        cuotas: { orderBy: { desde: "asc" } },
      },
    })
  ).map((o) => ({
    id: o.id,
    name: o.name,
    monthlyFee: o.monthlyFee === null ? null : Number(o.monthlyFee),
    cuotas: o.cuotas.map((c) => ({
      id: c.id,
      importe: Number(c.importe),
      desde: formatDate(c.desde),
      hasta: c.hasta ? formatDate(c.hasta) : null,
    })),
    grupos: o.groups.map((g) => ({
      id: g.id,
      name: g.name,
      managementPct: g.managementPct === null ? null : Number(g.managementPct),
      viviendas: g._count.properties,
    })),
  }));

  const viviendasParaComisiones = await prisma.property.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const [business, integration, ocr, importacion, employees, owners] = await Promise.all([
    prisma.business.findFirst({ where: { organizationId, type: BUSINESS_TYPES.RENTAL_MANAGEMENT } }),
    prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    }),
    prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "OCR" } },
    }),
    prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "IMPORT" } },
    }),
    prisma.employee.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);

  const hayClave = Boolean(integration?.apiKeyCifrada);
  const hayClaveOcr = Boolean(ocr?.apiKeyCifrada);
  const hayToken = Boolean(importacion?.apiKeyCifrada);

  async function businessAction(formData: FormData) {
    "use server";
    if (!business) return { error: "No hay ningún negocio de alquiler configurado." };
    // Devolver lo que responda: antes se tiraba, así que un guardado
    // rechazado se veía igual que uno correcto —nada— y los campos volvían a
    // los valores anteriores sin explicar por qué.
    return updateBusinessInfo(business.id, formData);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Ajustes" subtitle="Integración con Lodgify, comisiones, empleadas y propietarios" />

      <div className="card p-5">
        <h2 className="font-medium text-tinta mb-1">Integración con Lodgify</h2>
        <p className="text-xs text-tinta-suave mb-4">
          Lodgify no desglosa la comisión de plataforma ni la bancaria: se calculan automáticamente aplicando estos
          porcentajes sobre el precio total de cada reserva sincronizada. Una reserva ajustada manualmente nunca se
          sobrescribe.
        </p>
        <FormularioConAviso action={updateLodgifySettings} className="space-y-3">
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
            <label className="label" htmlFor="apiKey">
              Clave de API de Lodgify
            </label>
            {hayClave ? (
              <p className="text-sm text-bien bg-bien-suave border border-[#cfe6dd] rounded-lg px-3 py-2 mb-2">
                Hay una clave guardada (<span className="font-mono">{integration?.apiKeyMasked}</span>).
                La sincronización trae reservas reales de Lodgify.
              </p>
            ) : (
              <p className="text-sm text-aviso bg-aviso-suave border border-[#f6e0c4] rounded-lg px-3 py-2 mb-2">
                <strong>No hay clave.</strong> Mientras no la haya, «Sincronizar» no trae nada de
                Lodgify: se inventa reservas de ejemplo para poder probar. Pega aquí la clave de la
                cuenta de Lodgify y empezará a traer las de verdad.
              </p>
            )}
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={hayClave ? "Escribe otra para cambiarla" : "Pega aquí la clave"}
              className="input"
            />
            <p className="text-xs text-tinta-suave mt-1">
              Se guarda cifrada, y no se puede volver a leer desde la aplicación. Si lo dejas vacío
              se queda como está{hayClave ? "; escribe QUITAR para borrarla" : ""}.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-tinta-suave">
            <input type="checkbox" name="syncEnabled" defaultChecked={integration?.syncEnabled ?? true} />
            Sincronización activa
          </label>
          <button type="submit" className="btn-secondary">
            Guardar ajustes de integración
          </button>
        </FormularioConAviso>

        <div className="mt-4 pt-4 border-t border-borde">
          <SyncLodgifyButton />
          {integration?.lastSyncAt && (
            <p className="text-xs text-tinta-suave mt-2">Última sincronización: {formatDate(integration.lastSyncAt)}</p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-tinta mb-3">Empleadas</h2>
        <div className="space-y-2 mb-4">
          {employees.map((e) => {
            async function toggleAction(formData: FormData) {
              "use server";
              await setEmployeeActive(e.id, formData.get("active") === "true");
            }
            return (
              <div key={e.id} className="flex items-center justify-between border border-borde rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-tinta">{e.name}</p>
                  <p className="text-xs text-tinta-suave">{EMPLOYEE_ROLE_LABEL[e.role]} {e.phone ? `· ${e.phone}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={e.active ? "bg-bien-suave text-bien border-[#cfe6dd]" : "bg-marina-suave text-tinta-suave border-borde"}>
                    {e.active ? "Activa" : "Inactiva"}
                  </Badge>
                  <FormularioConAviso action={toggleAction}>
                    <input type="hidden" name="active" value={(!e.active).toString()} />
                    <button type="submit" className="text-xs text-tinta-suave hover:underline">
                      {e.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </FormularioConAviso>
                </div>
              </div>
            );
          })}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-oceano-oscuro">+ Añadir empleada</summary>
          <FormularioConAviso action={createEmployee} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
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
            <div>
              <label className="label">NIF/CIF</label>
              <input name="taxId" className="input" placeholder="B35709062" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Domicilio</label>
              <input name="address" className="input" placeholder="Calle, número, CP y municipio" />
            </div>
            <div>
              <label className="label">Cuota fija mensual (€)</label>
              <input name="monthlyFee" inputMode="decimal" className="input" placeholder="vacío" />
              <p className="text-xs text-tinta-suave mt-1">
                Solo si paga una cuota en vez de un porcentaje. Academia Cañada paga 600 € al mes.
              </p>
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-secondary">
                Añadir
              </button>
            </div>
          </FormularioConAviso>
        </details>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-tinta mb-3">Propietarios</h2>
        <div className="space-y-2 mb-4">
          {owners.map((o) => (
            <div key={o.id} className="border border-borde rounded-lg px-3 py-2">
              <p className="text-sm font-medium text-tinta">{o.name}</p>
              <p className="text-xs text-tinta-suave">{o.email ?? "—"} {o.phone ? `· ${o.phone}` : ""}</p>
            </div>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-oceano-oscuro">+ Añadir propietario</summary>
          <FormularioConAviso action={createOwner} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
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
            <div>
              <label className="label">NIF/CIF</label>
              <input name="taxId" className="input" placeholder="B35709062" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Domicilio</label>
              <input name="address" className="input" placeholder="Calle, número, CP y municipio" />
            </div>
            <div>
              <label className="label">Cuota fija mensual (€)</label>
              <input name="monthlyFee" inputMode="decimal" className="input" placeholder="vacío" />
              <p className="text-xs text-tinta-suave mt-1">
                Solo si paga una cuota en vez de un porcentaje. Academia Cañada paga 600 € al mes.
              </p>
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-secondary">
                Añadir
              </button>
            </div>
          </FormularioConAviso>
        </details>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-tinta mb-1">Lectura de facturas</h2>
        <p className="text-xs text-tinta-suave mb-3">
          Para que las facturas de gasto se lean solas al subirlas. Sin clave se pueden subir
          igual —el archivo se guarda siempre— pero los datos hay que escribirlos a mano.
        </p>
        <FormularioConAviso action={updateOcrSettings} className="space-y-3">
          {hayClaveOcr ? (
            <p className="text-sm text-bien bg-bien-suave border border-[#cfe6dd] rounded-lg px-3 py-2">
              Hay una clave guardada (<span className="font-mono">{ocr?.apiKeyMasked}</span>).
            </p>
          ) : (
            <p className="text-sm text-aviso bg-aviso-suave border border-[#f6e0c4] rounded-lg px-3 py-2">
              <strong>No hay clave.</strong> Las facturas se guardan al subirlas, pero no se leen
              solas.
            </p>
          )}
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={hayClaveOcr ? "Escribe otra para cambiarla" : "Pega aquí la clave"}
            className="input"
          />
          <p className="text-xs text-tinta-suave">
            Se guarda cifrada y no se puede volver a leer desde la aplicación. Si lo dejas vacío
            se queda como está{hayClaveOcr ? "; escribe QUITAR para borrarla" : ""}.
          </p>
          <button type="submit" className="btn-secondary">
            Guardar la clave de lectura
          </button>
        </FormularioConAviso>
      </div>

      <TokenDeImportacion hayToken={hayToken} />

      <GruposDePropietario propietarios={propietariosConGrupos} />

      <ComisionesPorCanal
        comisiones={comisionesCanal}
        viviendas={viviendasParaComisiones}
        porDefecto={integration ? Number(integration.defaultPlatformPct) : 15}
        bancoPorDefecto={integration ? Number(integration.defaultBankPct) : 2.5}
      />

      <GestionUsuarios usuarios={usuarios} />

      <EmpezarDeCero resumen={resumen} esDemostracion={esDemostracion} />

      {business && (
        <div className="card p-5">
          <h2 className="font-medium text-tinta mb-3">Datos del negocio de alquiler</h2>
          <FormularioConAviso action={businessAction} className="space-y-3">
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
          </FormularioConAviso>
        </div>
      )}
    </div>
  );
}

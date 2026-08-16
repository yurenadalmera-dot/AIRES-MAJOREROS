import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import { updatePartnerSplit, updatePartnerName } from "@/lib/actions/invoices";
import { updateBusinessInfo } from "@/lib/actions/settings";
import { BUSINESS_TYPES } from "@/lib/constants";

export default async function CleaningSettingsPage() {
  const { organizationId } = await requireBusinessContext();

  const [partners, splitConfig, business] = await Promise.all([
    prisma.partner.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.partnerSplitConfig.findFirst({ where: { organizationId }, orderBy: { effectiveFrom: "desc" } }),
    prisma.business.findFirst({ where: { organizationId, type: BUSINESS_TYPES.CLEANING_BILLING } }),
  ]);

  const partnerA = partners.find((p) => p.id === splitConfig?.partnerAId) ?? partners[0];
  const partnerB = partners.find((p) => p.id === splitConfig?.partnerBId) ?? partners[1];

  async function businessAction(formData: FormData) {
    "use server";
    if (business) await updateBusinessInfo(business.id, formData);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Ajustes de Aires Majoreros" subtitle="Reparto entre socias y datos de facturación" />

      <div className="card p-5">
        <h2 className="font-medium text-slate-800 mb-1">Reparto entre socias</h2>
        <p className="text-xs text-slate-500 mb-4">
          Por defecto 50/50. Se aplica a las próximas facturas que se generen (el histórico no cambia).
        </p>
        <form action={updatePartnerSplit} className="space-y-3">
          <input type="hidden" name="partnerAId" value={partnerA?.id} />
          <input type="hidden" name="partnerBId" value={partnerB?.id} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 w-32 truncate">{partnerA?.name ?? "Socia 1"}</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              name="partnerAPercent"
              defaultValue={splitConfig ? Number(splitConfig.partnerAPercent) : 50}
              className="input w-28"
            />
            <span className="text-xs text-slate-400">% (el resto va para {partnerB?.name ?? "Socia 2"})</span>
          </div>
          <button type="submit" className="btn-primary">
            Guardar reparto
          </button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-slate-800 mb-3">Socias</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {partners.map((p) => {
            async function renameAction(formData: FormData) {
              "use server";
              await updatePartnerName(p.id, formData);
            }
            return (
              <form key={p.id} action={renameAction} className="space-y-2 border border-slate-100 rounded-lg p-3">
                <div>
                  <label className="label">Nombre</label>
                  <input name="name" defaultValue={p.name} required className="input" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input name="email" type="email" defaultValue={p.email ?? ""} className="input" />
                </div>
                <button type="submit" className="btn-secondary text-xs">
                  Guardar
                </button>
              </form>
            );
          })}
        </div>
      </div>

      {business && (
        <div className="card p-5">
          <h2 className="font-medium text-slate-800 mb-3">Datos de facturación de Aires Majoreros</h2>
          <form action={businessAction} className="space-y-3">
            <div>
              <label className="label">Nombre visible</label>
              <input name="name" defaultValue={business.name} required className="input" />
            </div>
            <div>
              <label className="label">Razón social</label>
              <input name="legalName" defaultValue={business.legalName ?? ""} className="input" />
            </div>
            <div>
              <label className="label">NIF/CIF</label>
              <input name="taxId" defaultValue={business.taxId ?? ""} className="input" placeholder="Configura el real antes de emitir facturas de verdad" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email de contacto</label>
                <input name="contactEmail" type="email" defaultValue={business.contactEmail ?? ""} className="input" />
              </div>
              <div>
                <label className="label">Teléfono</label>
                <input name="contactPhone" defaultValue={business.contactPhone ?? ""} className="input" />
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Guardar datos
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

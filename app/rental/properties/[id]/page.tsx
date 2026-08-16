import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import PropertyForm from "@/components/PropertyForm";
import { updateProperty, setPropertyManualStatus, setPropertyActive } from "@/lib/actions/properties";
import { PROPERTY_STATUS_LABEL } from "@/lib/constants";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireBusinessContext();

  const [property, owners] = await Promise.all([
    prisma.property.findFirst({ where: { id, organizationId } }),
    prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);
  if (!property) notFound();

  async function updateAction(formData: FormData) {
    "use server";
    await updateProperty(id, formData);
  }

  async function manualStatusAction(formData: FormData) {
    "use server";
    const value = formData.get("manualStatus") as string;
    await setPropertyManualStatus(id, value || null);
  }

  async function toggleActiveAction(formData: FormData) {
    "use server";
    await setPropertyActive(id, formData.get("active") === "true");
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Editar vivienda · ${property.name}`}
        actions={
          <form action={toggleActiveAction}>
            <input type="hidden" name="active" value={(!property.active).toString()} />
            <button type="submit" className={property.active ? "btn-danger text-xs" : "btn-secondary text-xs"}>
              {property.active ? "Marcar como inactiva" : "Reactivar"}
            </button>
          </form>
        }
      />

      <div className="card p-4 mb-4">
        <p className="text-sm font-medium text-slate-700 mb-2">Forzar estado manualmente (opcional)</p>
        <p className="text-xs text-slate-500 mb-3">
          Por defecto el estado se calcula solo a partir de reservas y tareas. Úsalo solo para casos excepcionales
          (p. ej. vivienda cerrada por obras).
        </p>
        <form action={manualStatusAction} className="flex gap-2">
          <select name="manualStatus" defaultValue={property.manualStatus ?? ""} className="input">
            <option value="">Automático (recomendado)</option>
            {Object.entries(PROPERTY_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Aplicar
          </button>
        </form>
      </div>

      <PropertyForm
        owners={owners}
        initial={{
          name: property.name,
          locality: property.locality,
          address: property.address,
          capacity: property.capacity,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          cleaningPrice: Number(property.cleaningPrice),
          ownerId: property.ownerId,
          lodgifyPropertyId: property.lodgifyPropertyId,
        }}
        action={updateAction}
        redirectTo="/rental/properties"
      />
    </div>
  );
}

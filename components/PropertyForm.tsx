"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface OwnerOption {
  id: string;
  name: string;
}

interface PropertyFormValues {
  name: string;
  locality: string;
  address?: string | null;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  cleaningPrice: number;
  ownerId?: string | null;
  lodgifyPropertyId?: string | null;
}

export default function PropertyForm({
  owners,
  initial,
  action,
  redirectTo,
}: {
  owners: OwnerOption[];
  initial?: Partial<PropertyFormValues>;
  action: (formData: FormData) => Promise<void>;
  redirectTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        router.push(redirectTo);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar la vivienda");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Nombre de la vivienda</label>
          <input name="name" required defaultValue={initial?.name} className="input" />
        </div>
        <div>
          <label className="label">Localidad</label>
          <input name="locality" required defaultValue={initial?.locality} className="input" placeholder="Corralejo, Costa Calma..." />
        </div>
        <div className="md:col-span-2">
          <label className="label">Dirección (opcional)</label>
          <input name="address" defaultValue={initial?.address ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Capacidad (huéspedes)</label>
          <input type="number" min={1} name="capacity" defaultValue={initial?.capacity ?? 2} className="input" />
        </div>
        <div>
          <label className="label">Habitaciones</label>
          <input type="number" min={0} name="bedrooms" defaultValue={initial?.bedrooms ?? 1} className="input" />
        </div>
        <div>
          <label className="label">Baños</label>
          <input type="number" min={0} name="bathrooms" defaultValue={initial?.bathrooms ?? 1} className="input" />
        </div>
        <div>
          <label className="label">Precio de limpieza (€)</label>
          <input type="number" step="0.01" min={0} name="cleaningPrice" defaultValue={initial?.cleaningPrice ?? 0} className="input" />
          <p className="text-xs text-slate-400 mt-1">Importe que Aires Majoreros factura por cada limpieza de esta vivienda.</p>
        </div>
        <div>
          <label className="label">Propietario</label>
          <select name="ownerId" defaultValue={initial?.ownerId ?? ""} className="input">
            <option value="">Sin asignar</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ID de propiedad en Lodgify (opcional)</label>
          <input name="lodgifyPropertyId" defaultValue={initial?.lodgifyPropertyId ?? ""} className="input" placeholder="p.ej. lodgify-1001" />
          <p className="text-xs text-slate-400 mt-1">Necesario para emparejar reservas sincronizadas automáticamente.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push(redirectTo)} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando..." : "Guardar vivienda"}
        </button>
      </div>
    </form>
  );
}

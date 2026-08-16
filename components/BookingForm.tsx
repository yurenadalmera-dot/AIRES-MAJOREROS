"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateCommissions, formatCurrency } from "@/lib/money";
import { SUGGESTED_CHANNELS } from "@/lib/constants";

interface PropertyOption {
  id: string;
  name: string;
  locality: string;
}

interface BookingFormValues {
  id?: string;
  propertyId: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  adults: number;
  children: number;
  checkIn: string; // yyyy-mm-dd
  checkOut: string;
  channel: string;
  totalPrice: number;
  platformCommissionPct: number;
  bankCommissionPct: number;
  notes?: string | null;
}

export default function BookingForm({
  properties,
  initial,
  defaultPlatformPct,
  defaultBankPct,
  action,
  redirectTo,
}: {
  properties: PropertyOption[];
  initial?: Partial<BookingFormValues>;
  defaultPlatformPct: number;
  defaultBankPct: number;
  action: (formData: FormData) => Promise<void | string>;
  redirectTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [totalPrice, setTotalPrice] = useState(initial?.totalPrice ?? 0);
  const [platformPct, setPlatformPct] = useState(initial?.platformCommissionPct ?? defaultPlatformPct);
  const [bankPct, setBankPct] = useState(initial?.bankCommissionPct ?? defaultBankPct);

  const preview = useMemo(
    () =>
      calculateCommissions({
        totalPrice: Number(totalPrice) || 0,
        platformCommissionPct: Number(platformPct) || 0,
        bankCommissionPct: Number(bankPct) || 0,
      }),
    [totalPrice, platformPct, bankPct]
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        router.push(redirectTo);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar la reserva");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Vivienda</label>
          <select name="propertyId" required defaultValue={initial?.propertyId} className="input">
            <option value="" disabled>
              Selecciona una vivienda
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.locality}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Canal</label>
          <input
            name="channel"
            required
            list="channel-suggestions"
            defaultValue={initial?.channel ?? "Directo"}
            className="input"
          />
          <datalist id="channel-suggestions">
            {SUGGESTED_CHANNELS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="label">Huésped</label>
          <input name="guestName" required defaultValue={initial?.guestName} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Adultos</label>
            <input type="number" min={1} name="adults" defaultValue={initial?.adults ?? 2} required className="input" />
          </div>
          <div>
            <label className="label">Niños</label>
            <input type="number" min={0} name="children" defaultValue={initial?.children ?? 0} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Email huésped (opcional)</label>
          <input name="guestEmail" type="email" defaultValue={initial?.guestEmail ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Teléfono huésped (opcional)</label>
          <input name="guestPhone" defaultValue={initial?.guestPhone ?? ""} className="input" />
        </div>

        <div>
          <label className="label">Fecha de entrada</label>
          <input type="date" name="checkIn" required defaultValue={initial?.checkIn} className="input" />
        </div>
        <div>
          <label className="label">Fecha de salida</label>
          <input type="date" name="checkOut" required defaultValue={initial?.checkOut} className="input" />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-medium text-slate-800 mb-3">Importes y comisiones</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Precio total (€)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              name="totalPrice"
              required
              value={totalPrice}
              onChange={(e) => setTotalPrice(parseFloat(e.target.value) || 0)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Comisión plataforma (%)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              name="platformCommissionPct"
              required
              value={platformPct}
              onChange={(e) => setPlatformPct(parseFloat(e.target.value) || 0)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Comisión bancaria (%)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              name="bankCommissionPct"
              required
              value={bankPct}
              onChange={(e) => setBankPct(parseFloat(e.target.value) || 0)}
              className="input"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Comisión plataforma</p>
            <p className="font-medium text-slate-800">{formatCurrency(preview.platformCommissionAmt)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Comisión bancaria</p>
            <p className="font-medium text-slate-800">{formatCurrency(preview.bankCommissionAmt)}</p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
            <p className="text-xs text-green-700">Neto a percibir</p>
            <p className="font-semibold text-green-800">{formatCurrency(preview.netAmount)}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <label className="label">Notas (opcional)</label>
        <textarea name="notes" defaultValue={initial?.notes ?? ""} rows={2} className="input" />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push(redirectTo)} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando..." : "Guardar reserva"}
        </button>
      </div>
    </form>
  );
}

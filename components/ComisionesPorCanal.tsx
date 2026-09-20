"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { guardarComisionCanal, borrarComisionCanal } from "@/lib/actions/settings";
import { SUGGESTED_CHANNELS } from "@/lib/constants";

interface Comision {
  id: string;
  channel: string;
  platformPct: number;
}

/**
 * La comisión de cada canal de venta.
 *
 * Antes había un solo porcentaje para todas las reservas, y no es así: Airbnb
 * se lleva el 15 % y Booking.com el 18 %. Con un único número el neto de cada
 * reserva sale mal, y con él los informes del año entero.
 */
export default function ComisionesPorCanal({
  comisiones,
  porDefecto,
}: {
  comisiones: Comision[];
  porDefecto: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const r = (await accion()) as { error?: string };
        if (r?.error) {
          setError(r.error);
          return;
        }
        router.refresh();
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-800 mb-1">Comisión por canal de venta</h2>
      <p className="text-xs text-slate-500 mb-4">
        Cada canal se queda un porcentaje distinto. El que no esté aquí usa el general (
        {porDefecto} %).
      </p>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {comisiones.length > 0 && (
        <div className="space-y-2 mb-4">
          {comisiones.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-slate-700">{c.channel}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-800">{c.platformPct} %</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => ejecutar(() => borrarComisionCanal(c.id))}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        action={(fd) => ejecutar(() => guardarComisionCanal(fd))}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
      >
        <div className="sm:col-span-2">
          <label className="label" htmlFor="canal">
            Canal
          </label>
          <input
            id="canal"
            name="channel"
            list="canales-sugeridos"
            required
            className="input"
            placeholder="Airbnb"
          />
          <datalist id="canales-sugeridos">
            {SUGGESTED_CHANNELS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="pct">
            Comisión (%)
          </label>
          <input
            id="pct"
            name="platformPct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            className="input"
          />
        </div>
        <div className="sm:col-span-3">
          <button type="submit" disabled={pending} className="btn-secondary">
            {pending ? "Guardando..." : "Guardar comisión del canal"}
          </button>
          <p className="text-xs text-slate-400 mt-2">
            Afecta a las reservas que se sincronicen a partir de ahora. Las ya importadas
            conservan el porcentaje con el que entraron; para recalcularlas, vuelve a
            sincronizar.
          </p>
        </div>
      </form>
    </div>
  );
}

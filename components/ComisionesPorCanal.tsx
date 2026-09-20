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
  bankPct: number | null;
  propertyId: string | null;
  propertyName: string | null;
}

interface ViviendaVisible {
  id: string;
  name: string;
}

/**
 * La comisión de cada canal, y de cada casa dentro del canal.
 *
 * Antes había un solo porcentaje para todas las reservas. El Excel de 2026 dice
 * otra cosa: Airbnb se lleva el 15,5 % en todas las casas y sin comisión
 * bancaria, y Booking el 17 % en dos pisos y el 15 % en el resto, con un 1,3 %
 * de banco. Con un único número, el neto de cada reserva sale mal y con él los
 * informes del año entero.
 */
export default function ComisionesPorCanal({
  comisiones,
  viviendas,
  porDefecto,
  bancoPorDefecto,
}: {
  comisiones: Comision[];
  viviendas: ViviendaVisible[];
  porDefecto: number;
  bancoPorDefecto: number;
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
        Cada canal se queda un porcentaje distinto, y no siempre el mismo en todas las casas:
        Booking cobra más en unas que en otras. Lo que no esté aquí usa el general
        ({porDefecto} % de plataforma y {bancoPorDefecto} % de banco).
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
              <span className="text-sm text-slate-700">
                {c.channel}
                <span className="text-xs text-slate-400">
                  {" · "}
                  {c.propertyName ?? "todas las viviendas"}
                </span>
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-800">
                  {c.platformPct} %
                  <span className="text-xs font-normal text-slate-400">
                    {" + "}
                    {c.bankPct === null ? `${bancoPorDefecto} % banco` : `${c.bankPct} % banco`}
                  </span>
                </span>
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
        <div className="sm:col-span-2">
          <label className="label" htmlFor="vivienda">
            Vivienda
          </label>
          <select id="vivienda" name="propertyId" className="input" defaultValue="">
            <option value="">Todas</option>
            {viviendas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="banco">
            Comisión bancaria (%)
          </label>
          <input
            id="banco"
            name="bankPct"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder={`${bancoPorDefecto} (general)`}
          />
        </div>
        <div className="sm:col-span-3">
          <button type="submit" disabled={pending} className="btn-secondary">
            {pending ? "Guardando..." : "Guardar comisión del canal"}
          </button>
          <p className="text-xs text-slate-400 mt-2">
            Lo más concreto manda: si hay una comisión para «Booking en el Apto 27», esa se
            aplica a ese piso; el resto usa la de «Booking en todas». La bancaria en blanco
            significa la general, no cero.
            <br />
            Las reservas ya importadas conservan lo que tenían: para recalcularlas, vuelve a
            sincronizar.
          </p>
        </div>
      </form>
    </div>
  );
}

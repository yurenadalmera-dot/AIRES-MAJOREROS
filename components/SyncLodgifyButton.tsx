"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { syncLodgifyReservations, type SyncSummary } from "@/lib/actions/lodgify-sync";

export default function SyncLodgifyButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await syncLodgifyReservations();
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSummary(result);
        router.refresh();
      } catch (e) {
        // Un Error con mensaje propio dice algo útil (por ejemplo, que Lodgify
        // ha respondido 401). Si no, se mira si la página está desactualizada.
        setError(e instanceof Error && e.message ? e.message : await motivoDelFallo());
      }
    });
  }

  return (
    <div>
      <button onClick={handleClick} disabled={pending} className="btn-primary">
        {pending ? "Sincronizando..." : "🔄 Sincronizar ahora con Lodgify"}
      </button>
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
      {summary && (
        <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
          <p className="font-medium text-slate-700">
            {summary.liveMode
              ? "Datos reales de Lodgify"
              : "Datos de ejemplo (no hay clave de Lodgify guardada)"}
          </p>
          <p>
            🏠 Viviendas: {summary.propertiesCreated} dadas de alta ·{" "}
            {summary.propertiesUpdated} actualizadas
          </p>
          <p>Reservas recibidas: {summary.fetched} · Confirmadas (Booked): {summary.confirmed}</p>
          <p>✅ Creadas: {summary.created} · 🔄 Actualizadas: {summary.updated}</p>
          {summary.cancelled > 0 && (
            <p>🚫 Anuladas en Lodgify: {summary.cancelled} (su limpieza pendiente se ha cancelado)</p>
          )}
          <p>🔒 Omitidas por ajuste manual: {summary.skippedManuallyAdjusted}</p>
          {summary.unmatchedProperty > 0 && (
            <p>⚠️ Sin vivienda emparejada: {summary.unmatchedProperty}</p>
          )}
          {summary.propertiesCreated > 0 && (
            <p className="text-amber-800">
              Las viviendas nuevas entran sin propietario y con precio de limpieza 0: hay que
              completarlas en Viviendas antes de facturar sus limpiezas.
            </p>
          )}
          {summary.unmatchedDetails.length > 0 && (
            <ul className="list-disc list-inside text-slate-500">
              {summary.unmatchedDetails.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

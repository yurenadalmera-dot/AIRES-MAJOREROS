"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
        setSummary(result);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al sincronizar con Lodgify");
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
            {summary.liveMode ? "Modo real (API de Lodgify)" : "Modo demo (sin LODGIFY_API_KEY configurada)"}
          </p>
          <p>Reservas recibidas: {summary.fetched} · Confirmadas (Booked): {summary.confirmed}</p>
          <p>✅ Creadas: {summary.created} · 🔄 Actualizadas: {summary.updated}</p>
          <p>🔒 Omitidas por ajuste manual: {summary.skippedManuallyAdjusted}</p>
          <p>⚠️ Sin vivienda emparejada: {summary.unmatchedProperty}</p>
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

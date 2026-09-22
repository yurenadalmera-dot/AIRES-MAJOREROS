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
        {pending ? "Sincronizando…" : "Sincronizar ahora con Lodgify"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-mal mt-2">
          {error}
        </p>
      )}
      {summary && (
        <div className="mt-3 text-xs bg-marina-suave border border-borde rounded-lg p-3 space-y-1">
          <p className="font-medium text-tinta">
            {summary.liveMode
              ? "Datos reales de Lodgify"
              : "Datos de ejemplo (no hay clave de Lodgify guardada)"}
          </p>
          {summary.avisoViviendas ? (
            // Que se vea, pero sin alarmar: no haber podido leer las viviendas
            // no impide traer las reservas si ya están dadas de alta.
            <p className="text-aviso bg-aviso-suave border border-[#f6e0c4] rounded px-2 py-1">
              {summary.avisoViviendas}
            </p>
          ) : (
            <p>
              Viviendas: {summary.propertiesCreated} dadas de alta ·{" "}
              {summary.propertiesUpdated} actualizadas
            </p>
          )}
          <p>Reservas recibidas: {summary.fetched} · Confirmadas (Booked): {summary.confirmed}</p>
          <p>Creadas: {summary.created} · Actualizadas: {summary.updated}</p>
          {summary.cancelled > 0 && (
            <p>Anuladas en Lodgify: {summary.cancelled} (su limpieza pendiente se ha cancelado)</p>
          )}
          <p>Omitidas por ajuste manual: {summary.skippedManuallyAdjusted}</p>
          {summary.unmatchedProperty > 0 && (
            <p className="text-aviso">Sin vivienda emparejada: {summary.unmatchedProperty}</p>
          )}
          {summary.preciosPuestos > 0 && (
            <p>
              {summary.preciosPuestos} limpiezas estaban a 0 € y ya tienen precio. Venían de antes
              de que el precio saliera de la tarifa; a 0 € no se pueden facturar.
            </p>
          )}
          {summary.pastCleaningsDone > 0 && (
            <p>
              {summary.pastCleaningsDone} limpiezas de reservas ya terminadas se han dado por
              hechas (no estaban pendientes: la casa se limpió en su día).
            </p>
          )}
          {summary.propertiesCreated > 0 && (
            <p className="text-aviso">
              Las viviendas nuevas entran sin propietario y con precio de limpieza 0 —Lodgify no
              sabe nada de limpiezas—. Ponle a cada una su precio en Viviendas: al guardarlo, se
              aplica también a sus limpiezas todavía no facturadas.
            </p>
          )}
          {summary.unmatchedDetails.length > 0 && (
            <ul className="list-disc list-inside text-tinta-suave">
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { crearLimpiezaManual } from "@/lib/actions/tasks";

interface Opcion {
  id: string;
  name: string;
}

interface Resultado {
  creadas: number;
  repetidas: number;
  invalidas: string[];
  vivienda: string;
}

/**
 * Apuntar limpiezas que no vienen de ninguna reserva.
 *
 * Las viviendas que no están en Lodgify —las de Domingo Javier— tienen sus
 * limpiezas encargadas aparte, y son del orden de cien al año. Por eso el
 * campo de fecha acepta una lista: se elige la vivienda una vez y se pega la
 * columna de fechas de salida del Excel.
 */
export default function NuevaLimpieza({
  viviendas,
  empleadas,
}: {
  viviendas: Opcion[];
  empleadas: Opcion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Resultado | null>(null);

  function enviar(formData: FormData) {
    setError(null);
    setHecho(null);
    startTransition(async () => {
      try {
        const r = (await crearLimpiezaManual(formData)) as { error?: string } & Partial<Resultado>;
        if (r?.error) {
          setError(r.error);
          return;
        }
        setHecho(r as Resultado);
        router.refresh();
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <details className="card p-4 mb-4 no-print">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        + Nuevas limpiezas
      </summary>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}

      {hecho && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3">
          <p>
            {hecho.creadas === 0
              ? "No se ha añadido ninguna."
              : `${hecho.creadas} ${hecho.creadas === 1 ? "limpieza añadida" : "limpiezas añadidas"} en ${hecho.vivienda}.`}
            {hecho.repetidas > 0 &&
              ` ${hecho.repetidas} ya estaban apuntadas y no se han duplicado.`}
          </p>
          {hecho.invalidas.length > 0 && (
            <p className="text-amber-800 mt-1">
              No he entendido: {hecho.invalidas.join(", ")}
            </p>
          )}
        </div>
      )}

      <form action={enviar} className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
        <div>
          <label className="label" htmlFor="limpieza-vivienda">
            Vivienda
          </label>
          <select id="limpieza-vivienda" name="propertyId" required className="input">
            {viviendas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="limpieza-fechas">
            Fechas de limpieza
          </label>
          <textarea
            id="limpieza-fechas"
            name="date"
            required
            rows={4}
            className="input font-mono text-sm"
            placeholder={"04/09/2026\n08/09/2026\n21/09/2026"}
          />
          <p className="text-xs text-slate-400 mt-1">
            Una por línea. Puedes pegar directamente la columna de <strong>fechas de salida</strong>{" "}
            del Excel. Las que ya estén apuntadas no se duplican.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="limpieza-empleada">
            Quién la hace
          </label>
          <select id="limpieza-empleada" name="employeeId" className="input">
            <option value="">Sin asignar</option>
            {empleadas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label className="label mt-3" htmlFor="limpieza-nota">
            Nota
          </label>
          <input
            id="limpieza-nota"
            name="notes"
            className="input"
            placeholder="p.ej. las encarga Domingo Javier"
          />
        </div>

        <div className="md:col-span-4">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Añadiendo..." : "Añadir limpiezas"}
          </button>
          <p className="text-xs text-slate-400 mt-2">
            Se cobran al precio de limpieza de esa vivienda. Si no lo tiene puesto, la aplicación
            lo dice en lugar de crearlas a 0 €.
          </p>
        </div>
      </form>
    </details>
  );
}

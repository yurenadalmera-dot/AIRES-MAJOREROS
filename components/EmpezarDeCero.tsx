"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { empezarDeCero } from "@/lib/actions/datos";
import type { ResumenDeDatos } from "@/lib/datos-demo";

const ETIQUETAS: [keyof ResumenDeDatos, string, string][] = [
  ["viviendas", "vivienda", "viviendas"],
  ["propietarios", "propietario", "propietarios"],
  ["reservas", "reserva", "reservas"],
  ["tareas", "limpieza", "limpiezas"],
  ["facturas", "factura", "facturas"],
  ["personal", "persona del equipo", "personas del equipo"],
  ["socias", "socia", "socias"],
];

function enumerar(resumen: ResumenDeDatos): string {
  const partes = ETIQUETAS.filter(([k]) => resumen[k] > 0).map(
    ([k, singular, plural]) => `${resumen[k]} ${resumen[k] === 1 ? singular : plural}`
  );
  if (partes.length === 0) return "nada";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Vaciar los datos y empezar con los reales.
 *
 * Lo que hay ahora lo sembró el primer arranque para poder enseñar la
 * aplicación: viviendas y reservas inventadas. En cuanto entra gente de
 * verdad, estorban.
 */
export default function EmpezarDeCero({
  resumen,
  esDemostracion,
}: {
  resumen: ResumenDeDatos;
  esDemostracion: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const vacia = enumerar(resumen) === "nada";

  function enviar(formData: FormData) {
    setError(null);
    setHecho(null);
    startTransition(async () => {
      try {
        const r = (await empezarDeCero(formData)) as {
          error?: string;
          borrado?: ResumenDeDatos;
        };
        if (r?.error) {
          setError(r.error);
          return;
        }
        if (r?.borrado) setHecho(`Se ha borrado: ${enumerar(r.borrado)}.`);
        router.refresh();
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-800 mb-1">Datos de la aplicación</h2>
      <p className="text-xs text-slate-500 mb-4">
        {vacia ? "Ahora mismo no hay ningún dato cargado." : null}
        {!vacia && (
          <>
            Ahora mismo hay <strong>{enumerar(resumen)}</strong>.
          </>
        )}
      </p>

      {esDemostracion && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-4">
          Estas viviendas, reservas y propietarios son <strong>de demostración</strong>: los creó
          el primer arranque para poder enseñar la aplicación, y no corresponden a nada real.
          Conviene borrarlos antes de empezar a trabajar, para que no se mezclen con lo vuestro.
        </p>
      )}

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}
      {hecho && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
          {hecho} Ya podéis dar de alta las viviendas reales o sincronizar con Lodgify.
        </p>
      )}

      {!vacia && (
        <details>
          <summary className="cursor-pointer text-sm text-rose-700">
            Empezar de cero: borrar viviendas, reservas, limpiezas y facturas
          </summary>
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/50 p-4">
            <p className="text-sm text-slate-700 mb-1">
              Se borran <strong>{enumerar(resumen)}</strong>.
            </p>
            <p className="text-xs text-slate-500 mb-3">
              No se tocan las cuentas de acceso ni los datos fiscales de las dos empresas: quien
              entra sigue entrando, y el CIF, la dirección y la numeración de facturas se quedan
              como están. <strong>No se puede deshacer</strong> y no hay copia de seguridad.
            </p>
            <form action={enviar} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="confirmacion">
                  Escribe BORRAR para confirmar
                </label>
                <input
                  id="confirmacion"
                  name="confirmacion"
                  autoComplete="off"
                  required
                  className="input font-mono"
                />
              </div>
              <button type="submit" disabled={pending} className="btn-secondary text-rose-700">
                {pending ? "Borrando..." : "Borrar y empezar de cero"}
              </button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

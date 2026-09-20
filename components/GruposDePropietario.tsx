"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { crearGrupo, cambiarComisionDeGrupo, borrarGrupo } from "@/lib/actions/properties";

interface GrupoVisible {
  id: string;
  name: string;
  managementPct: number | null;
  viviendas: number;
}

interface PropietarioVisible {
  id: string;
  name: string;
  monthlyFee: number | null;
  grupos: GrupoVisible[];
}

/**
 * Los grupos de viviendas de cada propietario, con su comisión de gestión.
 *
 * Inversiones Brito tiene dos y cobran distinto: el Grupo Villa Mónica al 30 %
 * y Villa Monikka al 10 %. Si el porcentaje viviera en cada vivienda habría
 * que repetirlo once veces, y bastaría olvidarse de una para que la
 * liquidación saliera mal.
 */
export default function GruposDePropietario({
  propietarios,
}: {
  propietarios: PropietarioVisible[];
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
      <h2 className="font-medium text-slate-800 mb-1">Comisión de gestión por grupo</h2>
      <p className="text-xs text-slate-500 mb-4">
        Lo que se lleva Aires por gestionar, sobre lo que queda{" "}
        <strong>después de las comisiones de venta y de los gastos</strong>. Un propietario puede
        tener varios grupos con comisiones distintas.
      </p>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {propietarios.map((p) => (
          <div key={p.id} className="border border-slate-100 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700">
              {p.name}
              {p.monthlyFee !== null && (
                <span className="text-xs font-normal text-slate-500">
                  {" · "}cuota fija de {p.monthlyFee} € al mes
                </span>
              )}
            </p>

            {p.grupos.length === 0 ? (
              <p className="text-xs text-slate-400 mt-1">
                Sin grupos. Sus viviendas no llevan comisión de gestión salvo que se les ponga una
                a cada una.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {p.grupos.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 rounded px-3 py-2"
                  >
                    <span className="text-sm text-slate-700">
                      {g.name}
                      <span className="text-xs text-slate-400">
                        {" · "}
                        {g.viviendas} {g.viviendas === 1 ? "vivienda" : "viviendas"}
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={g.managementPct ?? ""}
                        disabled={pending}
                        aria-label={`Comisión de ${g.name}`}
                        inputMode="decimal"
                        placeholder="sin comisión"
                        onBlur={(e) => {
                          const nuevo = e.target.value.trim();
                          if (nuevo !== String(g.managementPct ?? "")) {
                            ejecutar(() => cambiarComisionDeGrupo(g.id, nuevo));
                          }
                        }}
                        className="input py-1 text-sm w-28 text-right"
                      />
                      <span className="text-sm text-slate-500">%</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => ejecutar(() => borrarGrupo(g.id))}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form
              action={(fd) => ejecutar(() => crearGrupo(fd))}
              className="mt-2 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="ownerId" value={p.id} />
              <input
                name="name"
                required
                placeholder="Nombre del grupo"
                className="input py-1 text-sm"
              />
              <input
                name="managementPct"
                inputMode="decimal"
                placeholder="%"
                className="input py-1 text-sm w-20 text-right"
              />
              <button type="submit" disabled={pending} className="btn-secondary text-xs">
                Añadir grupo
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import {
  crearGrupo,
  cambiarComisionDeGrupo,
  borrarGrupo,
  guardarCuotaFija,
  borrarCuotaFija,
} from "@/lib/actions/properties";

interface GrupoVisible {
  id: string;
  name: string;
  managementPct: number | null;
  viviendas: number;
}

interface CuotaVisible {
  id: string;
  importe: number;
  desde: string;
  hasta: string | null;
}

interface PropietarioVisible {
  id: string;
  name: string;
  monthlyFee: number | null;
  /** El histórico de cuotas, de la más antigua a la más nueva. */
  cuotas: CuotaVisible[];
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

            {/* La cuota sube: a Academia Cañada se le cobró 400 €, luego 500 y
                luego 600. Cada tramo con su fecha, para que un informe de todo
                el año cobre cada mes a su precio. */}
            {(p.cuotas.length > 0 || p.monthlyFee !== null) && (
              <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-2">
                <p className="text-xs font-medium text-slate-600 mb-1">Cuota fija, por tramos</p>
                {p.cuotas.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Tiene cuota pero no hay ningún tramo: no se le cobraría nada. Añade uno.
                  </p>
                ) : (
                  <div className="space-y-1 mb-2">
                    {p.cuotas.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600">
                          <strong className="text-slate-800">{c.importe} €</strong> al mes · desde{" "}
                          {c.desde}
                          {c.hasta ? ` hasta ${c.hasta}` : " (en vigor)"}
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => ejecutar(() => borrarCuotaFija(c.id))}
                          className="text-slate-400 hover:underline"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  action={(fd) => {
                    fd.set("ownerId", p.id);
                    ejecutar(() => guardarCuotaFija(fd));
                  }}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div>
                    <label className="block text-[11px] text-slate-500">Nueva cuota (€/mes)</label>
                    <input name="importe" inputMode="decimal" className="input h-8 text-xs w-28" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Desde</label>
                    <input name="desde" type="date" className="input h-8 text-xs" />
                  </div>
                  <button type="submit" disabled={pending} className="btn-secondary h-8 text-xs">
                    Añadir tramo
                  </button>
                </form>
                <p className="text-[11px] text-slate-400 mt-1">
                  Al añadir un tramo, el anterior se cierra el día antes. No se pisa lo que ya se
                  cobró.
                </p>
              </div>
            )}

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

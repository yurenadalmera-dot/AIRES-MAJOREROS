"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { crearGasto, borrarGasto } from "@/lib/actions/gastos";
import { formatCurrency, formatDate } from "@/lib/money";

interface Vivienda {
  id: string;
  name: string;
}

interface GastoVisible {
  id: string;
  date: string;
  concept: string;
  supplier: string | null;
  amount: number;
  propertyName: string;
}

/**
 * Los gastos de las viviendas.
 *
 * Sin ellos, la comisión de gestión sale siempre alta: se calcula sobre lo que
 * queda **después de gastos**, así que un mes sin gastos apuntados le cobra de
 * más al propietario y le liquida de menos.
 */
export default function Gastos({
  viviendas,
  gastos,
  total,
}: {
  viviendas: Vivienda[];
  gastos: GastoVisible[];
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function ejecutar(accion: () => Promise<unknown>, marcarHecho = false) {
    setError(null);
    setHecho(false);
    startTransition(async () => {
      try {
        const r = (await accion()) as { error?: string };
        if (r?.error) {
          setError(r.error);
          return;
        }
        if (marcarHecho) setHecho(true);
        router.refresh();
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-medium text-slate-800 mb-1">Apuntar un gasto</h2>
        <p className="text-xs text-slate-500 mb-4">
          Luz, agua, comunidad, una reparación… Lo que se gasta en la vivienda. La comisión de
          gestión se calcula sobre lo que queda <strong>después de los gastos</strong>, así que
          sin apuntarlos el propietario cobra de menos.
        </p>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}
        {hecho && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
            Gasto apuntado.
          </p>
        )}

        <form
          action={(fd) => ejecutar(() => crearGasto(fd), true)}
          className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
        >
          <div className="sm:col-span-2">
            <label className="label" htmlFor="gasto-vivienda">
              Vivienda
            </label>
            <select id="gasto-vivienda" name="propertyId" required className="input">
              {viviendas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="gasto-fecha">
              Fecha
            </label>
            <input id="gasto-fecha" name="date" type="date" required className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="gasto-concepto">
              Concepto
            </label>
            <input
              id="gasto-concepto"
              name="concept"
              required
              className="input"
              placeholder="p.ej. Luz de agosto"
            />
          </div>
          <div>
            <label className="label" htmlFor="gasto-importe">
              Importe (€)
            </label>
            <input
              id="gasto-importe"
              name="amount"
              inputMode="decimal"
              required
              className="input"
              placeholder="120,50"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="gasto-proveedor">
              Proveedor (opcional)
            </label>
            <input id="gasto-proveedor" name="supplier" className="input" placeholder="Endesa" />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Guardando..." : "Apuntar gasto"}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-medium text-slate-800">Gastos apuntados</h2>
          <p className="text-sm text-slate-500">
            {gastos.length === 0 ? "ninguno" : `${gastos.length} · ${formatCurrency(total)}`}
          </p>
        </div>

        {gastos.length === 0 ? (
          <p className="text-sm text-slate-400">
            Todavía no hay gastos. Mientras no los haya, los informes al propietario dan la
            comisión de gestión más alta de lo que toca.
          </p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vivienda</th>
                <th>Concepto</th>
                <th>Proveedor</th>
                <th>Importe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td>{formatDate(g.date)}</td>
                  <td>{g.propertyName}</td>
                  <td>{g.concept}</td>
                  <td className="text-slate-500">{g.supplier ?? "—"}</td>
                  <td>{formatCurrency(g.amount)}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => ejecutar(() => borrarGasto(g.id))}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

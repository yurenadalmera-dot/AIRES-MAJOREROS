"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { subirFactura, confirmarFactura, descartarFactura } from "@/lib/actions/ocr";
import type { LecturaDevuelta } from "@/lib/actions/ocr";

interface Vivienda {
  id: string;
  name: string;
}

/**
 * Subir una factura, que la lea la máquina y confirmarla.
 *
 * Lo que la máquina rellena se marca en **azul** (repásalo) y lo que
 * intentó y no encontró, en **ámbar** (escríbelo). El ámbar es la mitad que
 * se olvida: sin él, un campo vacío porque el modelo no lo encontró es
 * indistinguible de uno vacío porque no aplica, y se confirma sin rellenar.
 *
 * En cuanto se teclea en un campo deja de estar marcado: ya lo ha mirado
 * alguien, y seguir señalándolo enseña a ignorar las marcas.
 */
export default function SubirFactura({ viviendas }: { viviendas: Vivienda[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaDevuelta | null>(null);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [hecho, setHecho] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  function ejecutar<T>(accion: () => Promise<T>, despues?: (r: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const r = (await accion()) as T & { error?: string };
        if (r && typeof r === "object" && "error" in r && r.error) {
          setError(r.error as string);
          return;
        }
        despues?.(r);
        router.refresh();
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  const marcar = (campo: string) => {
    if (!lectura || tocados.has(campo)) return "";
    if (lectura.revision.faltantes.includes(campo)) {
      return "border-amber-400 bg-amber-50";
    }
    if (lectura.revision.rellenadosPorIa.includes(campo)) {
      return "border-sky-300 bg-sky-50";
    }
    return "";
  };
  const alTeclear = (campo: string) => () =>
    setTocados((t) => (t.has(campo) ? t : new Set(t).add(campo)));

  const d = lectura?.revision.datos;
  const viviendaLeida = d?.vivienda_id ?? "";

  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-800 mb-1">Subir una factura</h2>
      <p className="text-xs text-slate-500 mb-4">
        Foto o PDF de la factura del proveedor. Se lee sola y tú repasas lo que ha entendido
        antes de guardarla. <strong>Nada se apunta hasta que le das a registrar.</strong>
      </p>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}
      {hecho && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
          Gasto registrado.
        </p>
      )}

      {!lectura && (
        <form
          action={(fd) =>
            ejecutar(
              () => subirFactura(fd),
              (r) => {
                setLectura(r as LecturaDevuelta);
                setTocados(new Set());
                setHecho(false);
              }
            )
          }
          className="flex flex-wrap items-end gap-3"
        >
          <div className="grow">
            <label className="label" htmlFor="archivo">
              Factura (PDF o foto)
            </label>
            <input
              id="archivo"
              name="archivo"
              type="file"
              ref={archivoRef}
              required
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="input py-1.5"
            />
          </div>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Leyendo..." : "Leer factura"}
          </button>
        </form>
      )}

      {lectura && d && (
        <div className="space-y-4">
          {/* Los avisos van arriba y en texto, no escondidos tras un icono:
              son frases escritas para leerse. */}
          {lectura.errorLectura && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {lectura.errorLectura}
            </p>
          )}
          {lectura.revision.avisos.length > 0 && (
            <ul className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              {lectura.revision.avisos.map((a) => (
                <li key={a}>· {a}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Fiabilidad {Math.round(lectura.revision.fiabilidad * 100)} %
              {lectura.revision.motivos.length > 0 && ` — ${lectura.revision.motivos.join(", ")}`}
            </span>
            <a
              href={`/rental/gastos/documento/${lectura.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-sky-700 hover:underline"
            >
              Ver el original
            </a>
          </div>

          <form
            action={(fd) =>
              ejecutar(
                () => confirmarFactura(lectura.id, fd),
                () => {
                  setLectura(null);
                  setHecho(true);
                  if (archivoRef.current) archivoRef.current.value = "";
                }
              )
            }
            className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
          >
            <div className="sm:col-span-2">
              <label className="label" htmlFor="f-vivienda">
                Vivienda
              </label>
              <select
                id="f-vivienda"
                name="propertyId"
                required
                defaultValue={viviendaLeida}
                onChange={alTeclear("vivienda_id")}
                className={`input ${marcar("vivienda_id")}`}
              >
                <option value="">Elige una…</option>
                {viviendas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-fecha">
                Fecha
              </label>
              <input
                id="f-fecha"
                name="date"
                type="date"
                required
                defaultValue={d.fecha ?? ""}
                onChange={alTeclear("fecha")}
                className={`input ${marcar("fecha")}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="f-concepto">
                Concepto
              </label>
              <input
                id="f-concepto"
                name="concept"
                required
                defaultValue={d.concepto}
                onChange={alTeclear("concepto")}
                className={`input ${marcar("concepto")}`}
              />
            </div>
            <div>
              <label className="label" htmlFor="f-importe">
                Importe (€)
              </label>
              <input
                id="f-importe"
                name="amount"
                inputMode="decimal"
                required
                defaultValue={d.total ?? ""}
                onChange={alTeclear("total")}
                className={`input ${marcar("total")}`}
              />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="f-proveedor">
                Proveedor
              </label>
              <input
                id="f-proveedor"
                name="supplier"
                defaultValue={d.proveedor_literal}
                onChange={alTeclear("proveedor_literal")}
                className={`input ${marcar("proveedor_literal")}`}
              />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button type="submit" disabled={pending} className="btn-primary">
                {pending ? "Guardando..." : "Registrar el gasto"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  ejecutar(
                    () => descartarFactura(lectura.id),
                    () => setLectura(null)
                  )
                }
                className="btn-secondary"
              >
                Descartar
              </button>
            </div>
          </form>

          <p className="text-[11px] text-slate-400">
            <span className="inline-block w-3 h-3 align-middle rounded-sm border border-sky-300 bg-sky-50" />{" "}
            lo ha rellenado la máquina, repásalo ·{" "}
            <span className="inline-block w-3 h-3 align-middle rounded-sm border border-amber-400 bg-amber-50" />{" "}
            no lo ha encontrado, escríbelo tú
          </p>
        </div>
      )}
    </div>
  );
}

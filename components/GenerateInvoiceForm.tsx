"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generarFacturasDelPeriodo, type ResumenDeFacturacion } from "@/lib/actions/invoices";
import { Aviso } from "@/components/ui";
import { formatCurrency } from "@/lib/money";

/**
 * Emitir los documentos del periodo.
 *
 * Ya no se escribe a mano a quién se factura: los clientes son los
 * propietarios, y de cada uno sale su propio documento con el detalle de sus
 * viviendas. Los datos fiscales se toman de su ficha, que es donde se
 * mantienen, en vez de volver a teclearlos cada mes y arriesgarse a una
 * errata en un documento que ya no se puede deshacer.
 */
export default function GenerateInvoiceForm({
  defaultStart,
  defaultEnd,
  disabled,
}: {
  defaultStart: string;
  defaultEnd: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenDeFacturacion | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setResumen(null);
    startTransition(async () => {
      try {
        const r = await generarFacturasDelPeriodo(formData);
        if (r && typeof r === "object" && "creados" in r) {
          setResumen(r);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron emitir los documentos");
      }
    });
  }

  return (
    <form action={handleSubmit} className="card p-5 space-y-4">
      <h3 className="font-medium text-tinta">Emitir los documentos del periodo</h3>
      <p className="text-xs text-tinta-suave">
        Sale un documento por propietario, con el detalle de sus viviendas. Quien tenga puesto
        «resumen» en su ficha recibe solo el resumen, sin IGIC.
      </p>

      {error && (
        <p role="alert" className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {resumen && (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {resumen.creados.map((d) => (
              <li key={d.id}>
                <a
                  href={`/cleaning/invoices/${d.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#cfe6dd] bg-bien-suave px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-tinta">{d.propietario}</span>
                    <span className="block text-xs text-tinta-suave">
                      {d.tipo === "RESUMEN" ? "Resumen" : "Factura"} {d.numero}
                    </span>
                  </span>
                  <span className="cifra shrink-0 font-semibold text-tinta">
                    {formatCurrency(d.total)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {/* Lo que no se ha podido emitir no puede quedarse callado: esas
              limpiezas siguen sin cobrar y alguien tiene que enterarse. */}
          {resumen.pendientes.length > 0 && (
            <Aviso>
              <ul className="space-y-1">
                {resumen.pendientes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Aviso>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="periodo-desde">
            Periodo desde
          </label>
          <input
            id="periodo-desde"
            type="date"
            name="periodStart"
            defaultValue={defaultStart}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="periodo-hasta">
            Periodo hasta
          </label>
          <input
            id="periodo-hasta"
            type="date"
            name="periodEnd"
            defaultValue={defaultEnd}
            required
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="factura-notas">
          Notas (opcional)
        </label>
        <textarea id="factura-notas" name="notes" rows={2} className="input" />
      </div>
      <button type="submit" disabled={pending || disabled} className="btn-primary w-full">
        {pending ? "Emitiendo…" : "Emitir los documentos del periodo"}
      </button>
      {disabled && (
        <p className="text-xs text-aviso">No hay limpiezas pendientes de facturar todavía.</p>
      )}
    </form>
  );
}

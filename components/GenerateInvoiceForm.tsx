"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoice } from "@/lib/actions/invoices";

export default function GenerateInvoiceForm({
  defaultBilledToName,
  defaultBilledToTaxId,
  defaultStart,
  defaultEnd,
  disabled,
}: {
  defaultBilledToName: string;
  defaultBilledToTaxId: string;
  defaultStart: string;
  defaultEnd: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const id = await generateInvoice(formData);
        if (id) {
          router.push(`/cleaning/invoices/${id}`);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar la factura");
      }
    });
  }

  return (
    <form action={handleSubmit} className="card p-5 space-y-4">
      <h3 className="font-medium text-slate-800">Generar factura</h3>
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div>
        <label className="label">Cliente facturado</label>
        <input name="billedToName" defaultValue={defaultBilledToName} required className="input" />
      </div>
      <div>
        <label className="label">NIF/CIF del cliente</label>
        <input name="billedToTaxId" defaultValue={defaultBilledToTaxId} className="input" />
      </div>
      <div>
        <label className="label">Domicilio del cliente</label>
        <textarea
          name="billedToAddress"
          rows={2}
          className="input"
          placeholder="Calle, número, código postal y municipio"
        />
        <p className="text-xs text-slate-400 mt-1">
          El NIF y el domicilio del cliente salen impresos en la factura y son obligatorios.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Periodo desde</label>
          <input type="date" name="periodStart" defaultValue={defaultStart} required className="input" />
        </div>
        <div>
          <label className="label">Periodo hasta</label>
          <input type="date" name="periodEnd" defaultValue={defaultEnd} required className="input" />
        </div>
      </div>
      <div>
        <label className="label">Notas (opcional)</label>
        <textarea name="notes" rows={2} className="input" />
      </div>
      <button type="submit" disabled={pending || disabled} className="btn-primary w-full">
        {pending ? "Generando..." : "Generar factura con las limpiezas del periodo"}
      </button>
      {disabled && (
        <p className="text-xs text-amber-600">No hay limpiezas pendientes de facturar todavía.</p>
      )}
    </form>
  );
}

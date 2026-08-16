"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";

interface OwnerOption {
  id: string;
  name: string;
}

export default function ReportForm({
  owners,
  basePath,
}: {
  owners: OwnerOption[];
  /** Panel desde el que se genera el informe: "/rental" o "/cleaning". */
  basePath: string;
}) {
  const router = useRouter();
  const today = new Date();
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? "");
  const [start, setStart] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));

  function preset(kind: "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth") {
    if (kind === "thisWeek") {
      setStart(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setEnd(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (kind === "lastWeek") {
      const w = subWeeks(today, 1);
      setStart(format(startOfWeek(w, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setEnd(format(endOfWeek(w, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (kind === "thisMonth") {
      setStart(format(startOfMonth(today), "yyyy-MM-dd"));
      setEnd(format(endOfMonth(today), "yyyy-MM-dd"));
    } else {
      const m = subMonths(today, 1);
      setStart(format(startOfMonth(m), "yyyy-MM-dd"));
      setEnd(format(endOfMonth(m), "yyyy-MM-dd"));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`${basePath}/reports/print?ownerId=${ownerId}&start=${start}&end=${end}`);
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <div>
        <label className="label">Propietario</label>
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required className="input">
          <option value="" disabled>
            Selecciona un propietario
          </option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => preset("thisWeek")} className="btn-secondary text-xs">Esta semana</button>
        <button type="button" onClick={() => preset("lastWeek")} className="btn-secondary text-xs">Semana pasada</button>
        <button type="button" onClick={() => preset("thisMonth")} className="btn-secondary text-xs">Este mes</button>
        <button type="button" onClick={() => preset("lastMonth")} className="btn-secondary text-xs">Mes pasado</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Desde</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required className="input" />
        </div>
      </div>

      <button type="submit" disabled={!ownerId} className="btn-primary w-full">
        Generar informe
      </button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarEnvioDeInforme } from "@/lib/actions/properties";

/**
 * Dejar apuntado que este informe ya se ha mandado.
 *
 * Va aquí, en el propio informe, porque es donde se está justo después de
 * mandarlo: imprimirlo, adjuntarlo al correo y volver. Un botón en otra
 * pantalla sería un paso que nadie da.
 */
export default function MarcarInformeEnviado({
  ownerId,
  start,
  end,
  yaEnviado,
}: {
  ownerId: string;
  start: string;
  end: string;
  /** Si ya consta un envío de este mismo periodo. */
  yaEnviado: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function marcar(medio: "EMAIL" | "MANO") {
    setError(null);
    const fd = new FormData();
    fd.set("ownerId", ownerId);
    fd.set("start", start);
    fd.set("end", end);
    fd.set("medio", medio);
    startTransition(async () => {
      const r = (await registrarEnvioDeInforme(fd)) as { error?: string } | undefined;
      if (r?.error) {
        setError(r.error);
        return;
      }
      setHecho(true);
      router.refresh();
    });
  }

  if (hecho) {
    return <p className="text-xs text-bien no-print">Apuntado como enviado.</p>;
  }

  return (
    <div className="no-print text-right">
      {yaEnviado && !hecho && (
        <p className="text-xs text-tinta-suave mb-1">
          Ya consta enviado el {new Date(yaEnviado).toLocaleDateString("es-ES")}.
        </p>
      )}
      {error && <p className="text-xs text-mal mb-1">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => marcar("EMAIL")} disabled={pending} className="btn-secondary text-xs">
          {pending ? "Apuntando…" : "Marcar como enviado"}
        </button>
        <button onClick={() => marcar("MANO")} disabled={pending} className="btn-fantasma text-xs">
          Entregado a mano
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { generarTokenDeImportacion } from "@/lib/actions/settings";

/**
 * El token con el que n8n empuja los datos de Mirador.
 *
 * Se enseña **una sola vez**, al generarlo: de él aquí solo se guarda la
 * huella. Si se pierde, se genera otro — y generar otro invalida el anterior,
 * que es justo lo que hace falta si se ha escapado.
 */
export default function TokenDeImportacion({ hayToken }: { hayToken: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  function generar() {
    setError(null);
    startTransition(async () => {
      try {
        const r = (await generarTokenDeImportacion()) as { error?: string; token?: string };
        if (r?.error) {
          setError(r.error);
          return;
        }
        setToken(r.token ?? null);
        router.refresh();
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <div className="card p-5">
      <h2 className="font-medium text-tinta mb-1">Traerse los datos de Mirador</h2>
      <p className="text-xs text-tinta-suave mb-3">
        El workflow de n8n empuja aquí los propietarios, las viviendas y los movimientos del
        banco. Las reservas no hacen falta: se traen solas de Lodgify. Se puede repetir las veces
        que haga falta — cada apunte se reconoce por su huella y no se duplica.
      </p>

      {error && (
        <p className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {token ? (
        <div className="mb-3">
          <p className="text-sm text-bien bg-bien-suave border border-[#cfe6dd] rounded-lg px-3 py-2 mb-2">
            Cópialo ahora: <strong>no se vuelve a enseñar</strong>. Aquí solo se guarda su huella.
          </p>
          <code className="block text-xs bg-marina text-white rounded-lg px-3 py-2 break-all">
            {token}
          </code>
        </div>
      ) : (
        <p
          className={`text-sm rounded-lg px-3 py-2 mb-3 ${
            hayToken
              ? "text-tinta-suave bg-marina-suave border border-borde"
              : "text-aviso bg-aviso-suave border border-[#f6e0c4]"
          }`}
        >
          {hayToken
            ? "Hay un token generado. Si lo has perdido, genera otro: el anterior deja de valer."
            : "Todavía no hay token, así que n8n no puede empujar nada."}
        </p>
      )}

      <button type="button" disabled={pending} onClick={generar} className="btn-secondary">
        {pending ? "Generando..." : hayToken ? "Generar otro token" : "Generar el token"}
      </button>
    </div>
  );
}

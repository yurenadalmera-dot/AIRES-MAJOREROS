"use client";

import { useState, useTransition } from "react";
import { motivoDelFallo } from "@/lib/version-cliente";
import { cambiarMiContrasena } from "@/lib/actions/usuarios";

export default function CambiarContrasena() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function enviar(formData: FormData) {
    setError(null);
    setHecho(false);
    startTransition(async () => {
      try {
        const r = (await cambiarMiContrasena(formData)) as { error?: string; ok?: boolean };
        if (r && "error" in r && r.error) {
          setError(String(r.error));
          return;
        }
        setHecho(true);
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <form action={enviar} className="card p-5 space-y-3">
      <h2 className="font-medium text-tinta">Cambiar mi contraseña</h2>

      {error && (
        <p className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {hecho && (
        <p className="text-sm text-bien bg-bien-suave border border-[#cfe6dd] rounded-lg px-3 py-2">
          Contraseña cambiada. La próxima vez entra con la nueva.
        </p>
      )}

      <div>
        <label className="label" htmlFor="actual">
          Contraseña actual
        </label>
        <input
          id="actual"
          name="actual"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="nueva">
          Nueva contraseña
        </label>
        <input
          id="nueva"
          name="nueva"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className="input"
        />
        <p className="text-xs text-tinta-suave mt-1">Al menos 10 caracteres.</p>
      </div>
      <div>
        <label className="label" htmlFor="repetida">
          Repite la nueva
        </label>
        <input
          id="repetida"
          name="repetida"
          type="password"
          autoComplete="new-password"
          required
          className="input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Cambiando..." : "Cambiar contraseña"}
      </button>
    </form>
  );
}

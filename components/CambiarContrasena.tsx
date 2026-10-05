"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { cambiarMiContrasena } from "@/lib/actions/usuarios";
import { MINIMO_CONTRASENA } from "@/lib/acceso";
import CampoContrasena from "@/components/CampoContrasena";

/**
 * Cambiar la contraseña propia.
 *
 * Tiene dos caras. La de siempre, en «Mi cuenta», para quien quiere cambiarla.
 * Y la **obligatoria**, para quien acaba de entrar con una contraseña de un
 * solo uso: mismas tres casillas, pero dichas de otra manera —«la que te han
 * dado» en vez de «la actual»— y, al terminar, la lleva a su panel en lugar de
 * dejarla aquí mirando un aviso verde.
 */
export default function CambiarContrasena({
  obligatorio = false,
  destino = "/rental",
}: {
  obligatorio?: boolean;
  /** Adónde va al terminar, cuando el cambio era obligatorio. */
  destino?: string;
}) {
  const router = useRouter();
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
        if (obligatorio) {
          router.push(destino);
          router.refresh();
        }
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <form action={enviar} className="card p-5 space-y-3">
      <h2 className="font-medium text-tinta">
        {obligatorio ? "Pon tu contraseña" : "Cambiar mi contraseña"}
      </h2>

      {error && (
        <p
          role="alert"
          className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}
      {hecho && (
        <p
          role="status"
          className="text-sm text-bien bg-bien-suave border border-[#cfe6dd] rounded-lg px-3 py-2"
        >
          {obligatorio
            ? "Contraseña guardada. Entrando…"
            : "Contraseña cambiada. La próxima vez entra con la nueva."}
        </p>
      )}

      <CampoContrasena
        id="actual"
        etiqueta={obligatorio ? "La contraseña que te han dado" : "Contraseña actual"}
        autoComplete="current-password"
      />
      <CampoContrasena
        id="nueva"
        etiqueta={obligatorio ? "Tu contraseña nueva" : "Nueva contraseña"}
        autoComplete="new-password"
        minLength={MINIMO_CONTRASENA}
        ayuda={`Al menos ${MINIMO_CONTRASENA} caracteres.`}
      />
      <CampoContrasena id="repetida" etiqueta="Repite la nueva" autoComplete="new-password" />

      <button type="submit" disabled={pending || (obligatorio && hecho)} className="btn-primary w-full">
        {pending ? "Guardando..." : obligatorio ? "Guardar y entrar" : "Cambiar contraseña"}
      </button>
    </form>
  );
}

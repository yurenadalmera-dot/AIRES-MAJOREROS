"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motivoDelFallo } from "@/lib/version-cliente";
import { ponerContrasenaConEnlace } from "@/lib/actions/recuperacion";
import { MINIMO_CONTRASENA } from "@/lib/acceso";
import CampoContrasena from "@/components/CampoContrasena";

/**
 * El formulario al que lleva el enlace de «he olvidado mi contraseña».
 *
 * No pide la contraseña anterior —no la sabe, por eso está aquí— ni el correo:
 * de quién es la cuenta lo dice el enlace.
 */
export default function NuevaContrasenaConEnlace({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function enviar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const r = (await ponerContrasenaConEnlace(token, formData)) as { error?: string; ok?: boolean };
        if (r && "error" in r && r.error) {
          setError(String(r.error));
          return;
        }
        setHecho(true);
        // A la pantalla de entrada, y no directamente dentro: que entre con la
        // nueva es la comprobación de que la ha escrito como cree.
        router.push("/login?restablecida=1");
      } catch {
        setError(await motivoDelFallo());
      }
    });
  }

  return (
    <form action={enviar} className="card p-5 sm:p-6 space-y-3">
      {error && (
        <p
          role="alert"
          className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}

      <CampoContrasena
        id="nueva"
        etiqueta="Tu contraseña nueva"
        autoComplete="new-password"
        minLength={MINIMO_CONTRASENA}
        ayuda={`Al menos ${MINIMO_CONTRASENA} caracteres.`}
        autoFocus
      />
      <CampoContrasena id="repetida" etiqueta="Repítela" autoComplete="new-password" />

      <button type="submit" disabled={pending || hecho} className="btn-primary w-full">
        {pending || hecho ? "Guardando..." : "Guardar la contraseña"}
      </button>
    </form>
  );
}

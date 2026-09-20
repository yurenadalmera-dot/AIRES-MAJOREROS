"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Accion = (formData: FormData) => Promise<void | { error: string } | unknown>;

/**
 * Un `<form>` que enseña el motivo cuando la acción no sale adelante.
 *
 * Con `<form action={accionDeServidor}>` a secas, el valor que devuelve la
 * acción se pierde: si la acción rechaza el cambio, no pasa nada visible y
 * parece que se ha guardado. Y lanzar el error tampoco sirve, porque en
 * producción Next.js sustituye el mensaje por un texto genérico en inglés.
 *
 * Así que la acción devuelve `{ error }` y esto lo pinta encima del formulario.
 */
export default function FormularioConAviso({
  action,
  children,
  className,
  onSuccess,
}: {
  action: Accion;
  children: ReactNode;
  className?: string;
  /** Ruta a la que ir si todo va bien. Si no se indica, solo se refresca. */
  onSuccess?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function enviar(formData: FormData) {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      try {
        const resultado = await action(formData);
        if (resultado && typeof resultado === "object" && "error" in resultado) {
          setError(String((resultado as { error: string }).error));
          return;
        }
        setGuardado(true);
        if (onSuccess) router.push(onSuccess);
        router.refresh();
      } catch {
        // Un fallo inesperado: Next ya ha ocultado el detalle, así que se dice
        // lo único honesto que se puede decir.
        setError("No se ha podido guardar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <form action={enviar} className={className}>
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}
      {/* Decir que se ha guardado. Sin esto, guardar y que fallara se veían
          exactamente igual: la página se refresca y no pasa nada visible. */}
      {guardado && !pending && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
          Guardado.
        </p>
      )}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

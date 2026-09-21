"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DeleteBookingButton({
  deleteAction,
}: {
  deleteAction: () => Promise<void | { error: string } | unknown>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm("¿Eliminar esta reserva? Esta acción no se puede deshacer.")) return;
    setError(null);
    startTransition(async () => {
      // Si la acción se niega —sin permiso, por ejemplo— hay que decirlo: antes
      // se descartaba el resultado y parecía que había funcionado.
      const resultado = await deleteAction();
      if (resultado && typeof resultado === "object" && "error" in resultado) {
        setError(String((resultado as { error: string }).error));
        return;
      }
      router.push("/rental/bookings");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Borrar no es lo que se viene a hacer aquí, así que no compite con
          «Guardar»: botón de contorno, en rojo, y con su confirmación. */}
      <button
        onClick={handleClick}
        disabled={pending}
        className="btn-secondary text-xs text-mal border-[#f3d4d3] hover:bg-mal-suave"
      >
        {pending ? "Eliminando…" : "Eliminar reserva"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-mal bg-mal-suave border border-[#f3d4d3] rounded px-2 py-1 max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
}

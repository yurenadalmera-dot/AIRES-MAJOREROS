"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DeleteBookingButton({ deleteAction }: { deleteAction: () => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("¿Eliminar esta reserva? Esta acción no se puede deshacer.")) return;
    startTransition(async () => {
      await deleteAction();
      router.push("/rental/bookings");
      router.refresh();
    });
  }

  return (
    <button onClick={handleClick} disabled={pending} className="btn-danger text-xs">
      {pending ? "Eliminando..." : "Eliminar reserva"}
    </button>
  );
}

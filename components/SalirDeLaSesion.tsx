"use client";

import { useState } from "react";

/**
 * Salir, desde una pantalla que no tiene la barra de la aplicación.
 *
 * Hace falta en «Mi cuenta» cuando el cambio de contraseña es obligatorio: no
 * hay menú ni forma de volver atrás, y quien haya entrado con la cuenta que no
 * era se quedaba ahí encerrado hasta ponerle una contraseña a una cuenta ajena.
 */
export default function SalirDeLaSesion({ className = "" }: { className?: string }) {
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Navegación completa, no del enrutador: que no quede en memoria nada
      // de la sesión que se acaba de cerrar.
      window.location.href = "/login";
    }
  }

  return (
    <button type="button" onClick={salir} disabled={saliendo} className={className}>
      {saliendo ? "Saliendo…" : "Salir"}
    </button>
  );
}

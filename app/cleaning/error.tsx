"use client";

import Link from "next/link";
import { Aviso } from "@/components/ui";

/**
 * Cuando una pantalla del panel de limpiezas falla.
 *
 * Sin esto, un error deja la pantalla en blanco (o, en producción, el aviso
 * genérico de Next) y no hay forma de volver sin recargar a mano. Aquí se
 * explica qué ha pasado y se ofrece reintentar, que muchas veces basta: un
 * corte momentáneo con la base de datos se arregla solo.
 *
 * No se enseña el detalle técnico: `digest` es la referencia que sí aparece en
 * los registros del servidor, y es lo único que hace falta para buscarlo.
 */
export default function ErrorDeLimpiezas({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="serif text-2xl text-marina">Esta pantalla no ha podido cargarse</h1>
      <Aviso tono="mal">
        Ha fallado algo al preparar los datos. Vuelve a intentarlo; si sigue pasando, avisa con la
        referencia de abajo.
      </Aviso>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={reset} className="btn-primary">
          Volver a intentarlo
        </button>
        <Link href="/cleaning" className="btn-secondary">
          Ir a Facturación
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-tinta-suave">
          Referencia del error: <span className="cifra">{error.digest}</span>
        </p>
      )}
    </div>
  );
}

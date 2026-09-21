import { Cargando } from "@/components/ui";

/**
 * Lo que se ve mientras el servidor prepara una pantalla.
 *
 * Reproduce el esqueleto de lo que va a aparecer —un título, unas cifras y una
 * lista— en vez de dejar la pantalla en blanco o poner un texto de «cargando»:
 * así el contenido no da un salto cuando llega.
 */
export default function PantallaCargando() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className="esqueleto h-7 w-64" />
        <div className="esqueleto h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="esqueleto h-3 w-24" />
            <div className="esqueleto h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        <Cargando filas={5} />
      </div>
    </div>
  );
}

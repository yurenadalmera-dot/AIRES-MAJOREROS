import Link from "next/link";
import { addDays, startOfDay, startOfWeek, format } from "date-fns";
import { es } from "date-fns/locale";
import { requireBusinessContext } from "@/lib/business-context";
import { queLlevarEnLasLimpiezas } from "@/lib/preparacion";
import { PageHeader, Badge, EmptyState, Aviso } from "@/components/ui";
import { TASK_STATUS_LABEL } from "@/lib/constants";

/**
 * El calendario de limpiezas de Aires Majoreros.
 *
 * El tablero es una lista y contesta «qué hay pendiente». Esto contesta otra
 * cosa: **cómo viene la semana**. Cuatro limpiezas el sábado y ninguna el
 * lunes no se ve en una lista ordenada por fecha, y es justo lo que hay que
 * saber para repartir el trabajo.
 *
 * Cada día trae para cuánta gente hay que preparar cada casa, que es lo que
 * decide las sábanas y las toallas que se suben esa mañana.
 */
export default async function CalendarioDeLimpiezas({
  searchParams,
}: {
  searchParams: Promise<{ semanas?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.estado_tarea");
  const params = await searchParams;
  const semanas = Math.min(6, Math.max(1, Number(params.semanas ?? "3") || 3));

  const hoy = startOfDay(new Date());
  const desde = startOfWeek(hoy, { weekStartsOn: 1 });
  const hasta = addDays(desde, semanas * 7 - 1);

  const limpiezas = await queLlevarEnLasLimpiezas({ organizationId, desde, hasta });

  // Una casilla por día, aunque esté vacía: un hueco es información —ese día
  // no hay nadie que mover— y desaparecería si solo se pintaran los días con
  // trabajo.
  const dias: { fecha: Date; limpiezas: typeof limpiezas }[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const fecha = addDays(desde, i);
    dias.push({
      fecha,
      limpiezas: limpiezas.filter(
        (l) => startOfDay(l.fecha).getTime() === startOfDay(fecha).getTime()
      ),
    });
  }

  const conTrabajo = dias.filter((d) => d.limpiezas.length > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario de limpiezas"
        subtitle={`Las próximas ${semanas} semanas, para repartir el trabajo.`}
        serif
      />

      {limpiezas.length === 0 ? (
        <EmptyState
          icono="calendario"
          message="No hay limpiezas apuntadas en estas semanas."
          accion={{ href: "/cleaning/tasks", label: "Ver el tablero" }}
        />
      ) : (
        <>
          <p className="text-sm text-tinta-suave">
            {limpiezas.length} limpiezas repartidas en {conTrabajo} días.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {dias.map(({ fecha, limpiezas: delDia }) => {
              const esHoy = startOfDay(fecha).getTime() === hoy.getTime();
              return (
                <div
                  key={fecha.toISOString()}
                  className={`card p-2 min-h-[6rem] ${
                    esHoy ? "border-marca-fuerte" : delDia.length === 0 ? "opacity-60" : ""
                  }`}
                >
                  <p className="text-xs font-medium text-tinta">
                    {format(fecha, "EEE d", { locale: es })}
                    {esHoy && <span className="ml-1 text-marca-media">· hoy</span>}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {delDia.map((l) => (
                      <li key={l.taskId} className="rounded-lg border border-borde px-2 py-1.5">
                        <p className="text-xs font-medium leading-snug text-tinta">
                          {l.vivienda.nombre}
                        </p>
                        <p className="text-[0.75rem] leading-snug text-tinta-suave">
                          {l.servicio === "repaso" ? "Repaso" : "Salida"}
                          {" · "}
                          {l.vivienda.habitaciones} hab
                        </p>
                        {l.entra ? (
                          <p className="text-[0.75rem] leading-snug text-tinta">
                            {l.entra.adultos === 1 ? "1 adulto" : `${l.entra.adultos} adultos`}
                            {l.entra.ninos > 0 &&
                              (l.entra.ninos === 1 ? " y 1 niño" : ` y ${l.entra.ninos} niños`)}
                          </p>
                        ) : (
                          <p className="text-[0.75rem] leading-snug text-tinta-suave">
                            nadie después
                          </p>
                        )}
                        {l.entraElMismoDia && <Badge tono="aviso">entran hoy</Badge>}
                        {l.estado === "DONE" && <Badge tono="bien">hecha</Badge>}
                        {l.estado !== "DONE" && l.estado !== "PENDING" && (
                          <Badge tono="info">{TASK_STATUS_LABEL[l.estado] ?? l.estado}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Que se entienda de dónde sale el número de gente, porque no es el
              mismo con el que se factura. */}
          <Aviso tono="info">
            Las personas que salen en cada casilla son las que <strong>entran</strong> después de
            esa limpieza, que es para quien hay que preparar la casa. No es el número con el que se
            factura: ese es el de quien se va, y está en el tablero.
          </Aviso>

          <p className="text-xs text-tinta-suave">
            Para marcar una limpieza como hecha, en{" "}
            <Link href="/cleaning/tasks" className="enlace">
              el tablero
            </Link>
            . En cuanto se marca, Emma lo ve en su panel.
          </p>
        </>
      )}
    </div>
  );
}

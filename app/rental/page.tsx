import Link from "next/link";
import { startOfDay, endOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, StatCard, Badge, EmptyState, EnlaceVer, Aviso } from "@/components/ui";
import { IconoCasa, IconoEntrada, IconoLimpieza, IconoSalida } from "@/components/iconos";
import { formatDateLong } from "@/lib/money";
import { computePropertyStatus } from "@/lib/status";
import {
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_COLOR,
  PROPERTY_STATUS_HINT,
} from "@/lib/constants";

/**
 * El panel del día responde, de arriba abajo, a tres preguntas:
 *
 *   1. ¿Qué pasa hoy?          → las cuatro cifras del día
 *   2. ¿Qué necesita atención? → entradas, salidas y el aviso de limpiezas
 *   3. ¿Cómo están las casas?  → el estado de cada vivienda
 *
 * Todo lo que se enseña sale de la base de datos. No hay tendencias ni
 * porcentajes de comparación: el sistema no guarda histórico de ocupación, así
 * que un «+12 % respecto a ayer» sería inventado.
 */
export default async function RentalDashboardPage() {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const [checkIns, checkOuts, allProperties, allBookingsToday, allTasksToday, pendingCleaningTasks] =
    await Promise.all([
      prisma.booking.findMany({
        where: { organizationId, status: "CONFIRMED", checkIn: { gte: todayStart, lte: todayEnd } },
        include: { property: true },
        orderBy: { property: { name: "asc" } },
      }),
      prisma.booking.findMany({
        where: { organizationId, status: "CONFIRMED", checkOut: { gte: todayStart, lte: todayEnd } },
        include: { property: true },
        orderBy: { property: { name: "asc" } },
      }),
      prisma.property.findMany({
        where: { organizationId, active: true },
        include: { owner: true },
        orderBy: { name: "asc" },
      }),
      prisma.booking.findMany({ where: { organizationId, status: "CONFIRMED" } }),
      // Igual que en la pantalla de viviendas: solo lo que puede afectar a hoy.
      prisma.cleaningTask.findMany({
        where: {
          organizationId,
          OR: [{ date: { lte: todayEnd } }, { status: "IN_PROGRESS" }],
        },
      }),
      prisma.cleaningTask.findMany({
        where: { organizationId, type: "CLEANING", status: { in: ["PENDING", "IN_PROGRESS"] } },
        include: { property: true },
      }),
    ]);

  const statuses = allProperties.map((p) =>
    computePropertyStatus(
      p.manualStatus,
      allBookingsToday.filter((b) => b.propertyId === p.id),
      allTasksToday.filter((t) => t.propertyId === p.id)
    )
  );
  const occupiedCount = statuses.filter((s) => s === "OCCUPIED").length;
  const cleaningNeededCount = statuses.filter((s) => s === "CLEANING_NEEDED").length;
  const availableCount = statuses.filter((s) => s === "AVAILABLE").length;

  // Con pocas viviendas se leen mejor en fichas; a partir de cierto número, la
  // tabla gana: cabe más en pantalla y las columnas se comparan de un vistazo.
  const enTabla = allProperties.length > 12;

  // La ficha de una vivienda, tal y como se ve en la rejilla.
  const fichas = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {allProperties.map((p, i) => (
        <Link
          key={p.id}
          href={`/rental/properties/${p.id}`}
          title={PROPERTY_STATUS_HINT[statuses[i]]}
          className="rounded-xl border border-borde px-4 py-3 transition-colors hover:bg-marina-suave"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-tinta truncate">{p.name}</p>
            <Badge className={PROPERTY_STATUS_COLOR[statuses[i]]}>
              {PROPERTY_STATUS_LABEL[statuses[i]]}
            </Badge>
          </div>
          <p className="text-xs text-tinta-suave mt-1">
            {p.locality}
            {p.owner ? ` · ${p.owner.name}` : ""}
          </p>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-7">
      <PageHeader
        title="Panel del día"
        subtitle={formatDateLong(today)}
        serif
        actions={
          <Link href="/rental/bookings/new" className="btn-primary">
            + Nueva reserva
          </Link>
        }
      />

      {/* 1 · Qué pasa hoy ---------------------------------------------------- */}
      <section aria-labelledby="hoy">
        <h2 id="hoy" className="sr-only">
          Resumen de hoy
        </h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Viviendas activas"
            value={allProperties.length}
            icono="casa"
            href="/rental/properties"
          />
          <StatCard
            label="Ocupadas hoy"
            value={occupiedCount}
            tone="ocean"
            hint="Con una reserva en curso"
          />
          <StatCard
            label="Libres hoy"
            value={availableCount}
            tone="good"
            hint="Sin reserva en curso hoy"
          />
          {/* Este no es un dato informativo más: es trabajo por hacer. Va
              marcado con el naranja de la casa y el icono de aviso para que no
              se confunda con los tres de al lado. */}
          <StatCard
            label="Limpiezas pendientes"
            value={pendingCleaningTasks.length}
            tone={pendingCleaningTasks.length > 0 ? "warn" : "good"}
            alerta={pendingCleaningTasks.length > 0}
            hint={
              pendingCleaningTasks.length > 0
                ? "Pendientes o en curso · ir al tablero"
                : "Nada pendiente"
            }
            href="/cleaning/tasks"
          />
        </div>
      </section>

      {cleaningNeededCount > 0 && (
        <Aviso>
          Hay {cleaningNeededCount}{" "}
          {cleaningNeededCount === 1 ? "vivienda con salida hoy" : "viviendas con salida hoy"} cuya
          limpieza todavía no está marcada como hecha.{" "}
          <Link href="/cleaning/tasks" className="underline font-medium">
            Ver el tablero de limpieza
          </Link>
          .
        </Aviso>
      )}

      {/* 2 · Movimientos de hoy ---------------------------------------------- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6" aria-labelledby="movimientos">
        <h2 id="movimientos" className="sr-only">
          Entradas y salidas de hoy
        </h2>

        <div className="card p-4 sm:p-5">
          <div className="card-titulo">
            <h2 className="flex items-center gap-2">
              <IconoEntrada size={18} className="text-oceano" />
              Entradas de hoy
              <span className="cifra rounded-full bg-oceano-suave px-2 py-0.5 text-xs font-semibold text-oceano-oscuro">
                {checkIns.length}
              </span>
            </h2>
            <EnlaceVer href="/rental/bookings">Todas las reservas</EnlaceVer>
          </div>
          {checkIns.length === 0 ? (
            <EmptyState
              icono="entrada"
              message="Hoy no entra nadie. Las entradas aparecen aquí en cuanto hay una reserva confirmada que empieza hoy."
            />
          ) : (
            <ul className="space-y-2">
              {checkIns.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/rental/bookings/${b.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-borde px-3.5 py-3 transition-colors hover:bg-marina-suave"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-tinta truncate">{b.property.name}</p>
                      {/* Sin hora: el sistema guarda el día de entrada, no la
                          hora, y ponerla sería inventársela. */}
                      <p className="text-xs text-tinta-suave truncate">
                        {b.guestName} · {b.adults} {b.adults === 1 ? "adulto" : "adultos"}
                        {b.children ? ` · ${b.children} ${b.children === 1 ? "niño" : "niños"}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tono="neutro">{b.channel}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4 sm:p-5">
          <div className="card-titulo">
            <h2 className="flex items-center gap-2">
              <IconoSalida size={18} className="text-acento-texto" />
              Salidas de hoy
              <span className="cifra rounded-full bg-acento-suave px-2 py-0.5 text-xs font-semibold text-acento-texto">
                {checkOuts.length}
              </span>
            </h2>
            <EnlaceVer href="/cleaning/tasks">Tablero de limpiezas</EnlaceVer>
          </div>
          {checkOuts.length === 0 ? (
            <EmptyState
              icono="salida"
              message="Hoy no sale nadie. Cada salida deja una limpieza por hacer, así que este hueco vacío es buena noticia."
            />
          ) : (
            <ul className="space-y-2">
              {checkOuts.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/rental/bookings/${b.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-borde px-3.5 py-3 transition-colors hover:bg-marina-suave"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-tinta truncate">{b.property.name}</p>
                      <p className="text-xs text-tinta-suave truncate">{b.guestName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tono="neutro">{b.channel}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 3 · Cómo están las viviendas ---------------------------------------- */}
      <section className="card p-4 sm:p-5" aria-labelledby="viviendas">
        <div className="card-titulo">
          <h2 id="viviendas" className="flex items-center gap-2">
            <IconoLimpieza size={18} className="text-oceano" />
            Estado de las viviendas
          </h2>
          <EnlaceVer href="/rental/properties">Ver todas</EnlaceVer>
        </div>

        {/* Libre no es lo mismo que lista: conviene decirlo donde se lee el
            estado, no en la cabeza de quien lo mira. */}
        <p className="text-xs text-tinta-suave mb-4">
          «Libre» quiere decir que hoy no hay reserva en curso. Que la vivienda esté lista para
          entrar lo dice el{" "}
          <Link href="/cleaning/tasks" className="enlace">
            tablero de limpiezas
          </Link>
          .
        </p>

        {allProperties.length === 0 ? (
          <EmptyState
            icono="casa"
            message="Todavía no hay viviendas activas."
            accion={{ href: "/rental/properties", label: "Añadir una vivienda" }}
          />
        ) : enTabla ? (
          // Con muchas viviendas la tabla cabe mejor... en una pantalla ancha.
          // En el móvil esa misma tabla deja el estado fuera de la vista, que
          // es justo la columna que se viene a mirar, así que ahí van fichas.
          <>
            <div className="lg:hidden">{fichas}</div>
            <div className="hidden lg:block overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Vivienda</th>
                    <th>Localidad</th>
                    <th>Propietario</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {allProperties.map((p, i) => (
                    <tr key={p.id}>
                      <td className="font-medium text-tinta">
                        <Link href={`/rental/properties/${p.id}`} className="enlace">
                          {p.name}
                        </Link>
                      </td>
                      <td className="text-tinta-suave">{p.locality}</td>
                      <td className="text-tinta-suave">{p.owner?.name ?? "—"}</td>
                      <td title={PROPERTY_STATUS_HINT[statuses[i]]}>
                        <Badge className={PROPERTY_STATUS_COLOR[statuses[i]]}>
                          {PROPERTY_STATUS_LABEL[statuses[i]]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          fichas
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge, EmptyState, Aviso } from "@/components/ui";
import { formatDate } from "@/lib/money";
import {
  estadoDelParte,
  ESTADO_DEL_PARTE_LABEL,
  ESTADO_DEL_PARTE_TONO,
  type EstadoDelParte,
} from "@/lib/viajeros";

/**
 * Partes de viajeros: quién entra pronto y todavía no ha dado sus datos.
 *
 * El Real Decreto 933/2021 obliga a registrar e informar los datos de cada
 * viajero. Lo que cuesta de eso no es la ley, es perseguir a la gente: esta
 * pantalla existe para no descubrir que faltan datos el día que llegan.
 *
 * Ordena por entrada, primero lo que viene antes, que es lo que urge.
 */
export default async function PartesDeViajeros({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");
  const params = await searchParams;

  const dias = Math.min(90, Math.max(1, Number(params.dias ?? "30") || 30));
  const desde = startOfDay(new Date());
  const hasta = addDays(desde, dias);

  const reservas = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      checkIn: { gte: desde, lte: hasta },
    },
    include: {
      property: { select: { name: true } },
      huespedes: true,
    },
    orderBy: { checkIn: "asc" },
  });

  const conEstado = reservas.map((r) => ({
    reserva: r,
    estado: estadoDelParte({
      comunicadoEl: r.comunicadoEl,
      viajeros: r.huespedes,
      huespedesEsperados: r.adults + r.children,
      entrada: r.checkIn,
    }) as EstadoDelParte,
  }));

  const pendientes = conEstado.filter((c) => c.estado !== "COMUNICADO");
  const urgentes = pendientes.filter(
    (c) => c.reserva.checkIn <= addDays(desde, 2) && c.estado !== "COMPLETO"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partes de viajeros"
        subtitle={`Entradas de los próximos ${dias} días. La ley obliga a registrar los datos de cada persona que se aloja.`}
        serif
      />

      {/* El envío a SES.HOSPEDAJES todavía no está: falta la especificación
          del servicio web, que se descarga de la propia plataforma. Mientras
          tanto esto sirve para recoger los datos y saber a quién le faltan. */}
      <Aviso tono="info">
        Los datos se recogen y se guardan cifrados, pero <strong>el envío automático a
        SES.HOSPEDAJES todavía no está montado</strong>: falta la documentación del servicio web,
        que se descarga desde la propia plataforma. De momento el parte hay que subirlo a mano.
      </Aviso>

      {urgentes.length > 0 && (
        <Aviso>
          {urgentes.length === 1
            ? "Hay una reserva que entra en menos de dos días y le faltan datos."
            : `Hay ${urgentes.length} reservas que entran en menos de dos días y les faltan datos.`}
        </Aviso>
      )}

      {conEstado.length === 0 ? (
        <EmptyState
          icono="usuario"
          message={`No hay entradas confirmadas en los próximos ${dias} días.`}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Vivienda</th>
                <th>Reserva a nombre de</th>
                <th className="num">Viajeros</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {conEstado.map(({ reserva: r, estado }) => {
                const esperados = r.adults + r.children;
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDate(r.checkIn)}</td>
                    <td className="font-medium text-tinta">{r.property.name}</td>
                    <td className="text-tinta-suave">{r.guestName}</td>
                    <td className="num">
                      {r.huespedes.length} / {esperados}
                    </td>
                    <td>
                      <Badge className={ESTADO_DEL_PARTE_TONO[estado]}>
                        {ESTADO_DEL_PARTE_LABEL[estado]}
                      </Badge>
                    </td>
                    <td>
                      <Link href={`/rental/bookings/${r.id}`} className="enlace text-xs">
                        Ver reserva
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-tinta-suave">
        {pendientes.length === 0
          ? "Todas las entradas del periodo tienen su parte comunicado."
          : `${pendientes.length} de ${conEstado.length} entradas siguen sin comunicar.`}
      </p>
    </div>
  );
}

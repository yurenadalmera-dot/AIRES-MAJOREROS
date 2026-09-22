import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { llegadasProximas, listaParaEscribir } from "@/lib/llegada";
import { PageHeader, Badge, EmptyState, Aviso } from "@/components/ui";
import { formatDate } from "@/lib/money";

/**
 * Quién llega pronto y si tenemos qué contarle.
 *
 * La mitad de la atención al huésped es siempre la misma pregunta —cómo se
 * llega, a qué hora se entra, cuál es el wifi— contestada de noche y a mano.
 * Esta pantalla no manda nada: enseña qué viviendas están listas para que se
 * mande solo, y cuáles no, que es lo único que hay que hacer una vez.
 */
export default async function Llegadas({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");
  const params = await searchParams;
  const dias = Math.min(30, Math.max(1, Number(params.dias ?? "7") || 7));

  const llegadas = await llegadasProximas({ organizationId, dias });
  const incompletas = llegadas.filter((l) => !listaParaEscribir(l));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Llegadas"
        subtitle={`Quién entra en los próximos ${dias} días y si tenemos qué contarle.`}
        serif
      />

      {/* Mientras el envío no esté montado, que la pantalla no dé a entender
          que sí. */}
      <Aviso tono="info">
        Esto todavía <strong>no manda nada solo</strong>: de momento enseña qué viviendas tienen ya
        escrito cómo se llega y cuáles no. Lo que se rellene aquí es lo que después saldrá en el
        correo al huésped.
      </Aviso>

      {incompletas.length > 0 && (
        <Aviso>
          {incompletas.length === 1
            ? "Hay una entrada cuya vivienda todavía no tiene escrito cómo se llega."
            : `Hay ${incompletas.length} entradas cuyas viviendas todavía no tienen escrito cómo se llega.`}
        </Aviso>
      )}

      {llegadas.length === 0 ? (
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
                <th>Huésped</th>
                <th>Qué falta</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {llegadas.map((l) => (
                <tr key={l.bookingId}>
                  <td className="whitespace-nowrap">
                    {formatDate(l.entrada)}
                    <span className="block text-xs text-tinta-suave">
                      {l.diasHastaLaEntrada === 0
                        ? "hoy"
                        : l.diasHastaLaEntrada === 1
                          ? "mañana"
                          : `en ${l.diasHastaLaEntrada} días`}
                    </span>
                  </td>
                  <td className="font-medium text-tinta">{l.vivienda.nombre}</td>
                  <td className="text-tinta-suave">{l.huesped}</td>
                  <td>
                    {l.falta.length === 0 ? (
                      <Badge tono="bien">Lista</Badge>
                    ) : (
                      <span className="text-xs text-aviso">
                        Falta {l.falta.map((f) => f.etiqueta).join(", ")}
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/rental/bookings/${l.bookingId}`} className="enlace text-xs">
                      Ver reserva
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-tinta-suave">
        Lo de «cómo se llega» se escribe una vez por vivienda, en su ficha. El código de la caja de
        llaves se guarda cifrado y nunca viaja en el correo.
      </p>
    </div>
  );
}

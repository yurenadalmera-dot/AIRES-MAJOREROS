import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, Aviso } from "@/components/ui";
import ReportForm from "@/components/ReportForm";
import { formatDate } from "@/lib/money";

/**
 * Selector de informe por propietario, compartido por ambos negocios.
 * `basePath` determina a qué ruta de impresión se navega, para que el informe
 * se abra dentro del panel desde el que se pidió (y conserve su navegación).
 */
export default async function OwnerReportsView({
  organizationId,
  basePath,
  subtitle,
}: {
  organizationId: string;
  basePath: string;
  subtitle: string;
}) {
  const [owners, envios] = await Promise.all([
    prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    // Los últimos envíos, para no mandar dos veces el mismo ni dejar a nadie
    // sin el suyo. Antes esto solo estaba en la bandeja de enviados de quien
    // lo hubiera mandado.
    prisma.envioDeInforme.findMany({
      where: { owner: { organizationId } },
      include: { owner: { select: { name: true } } },
      orderBy: { enviadoEl: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Informes por propietario" subtitle={subtitle} serif />

      {owners.length === 0 ? (
        <EmptyState
          icono="informe"
          message="Da de alta un propietario en Ajustes antes de generar informes."
          accion={{ href: "/rental/settings", label: "Ir a Ajustes" }}
        />
      ) : (
        <ReportForm owners={owners} basePath={basePath} />
      )}

      {/* El envío automático todavía no está: lo hacía un workflow que leía de
          Airtable y se apagó. Mientras se rehace, esto al menos deja dicho a
          quién se le ha mandado ya. */}
      <Aviso tono="info">
        El envío automático de los viernes está apagado desde que se desmontó Airtable. De momento
        el informe se manda a mano, y aquí abajo queda apuntado quién lo ha recibido.
      </Aviso>

      <section className="card p-4 sm:p-5">
        <div className="card-titulo">
          <h2>Últimos informes enviados</h2>
        </div>
        {envios.length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía no consta ningún envío.</p>
        ) : (
          <ul className="space-y-2">
            {envios.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tinta">{e.owner.name}</p>
                  <p className="text-xs text-tinta-suave">
                    {formatDate(e.periodStart)} – {formatDate(e.periodEnd)}
                    {e.destinatario ? ` · ${e.destinatario}` : ""}
                    {e.medio === "MANO" ? " · entregado a mano" : ""}
                  </p>
                </div>
                <p className="text-xs text-tinta-suave">{formatDate(e.enviadoEl)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

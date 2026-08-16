import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import ReportForm from "@/components/ReportForm";

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
  const owners = await prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-xl">
      <PageHeader title="Informes por propietario" subtitle={subtitle} />
      {owners.length === 0 ? (
        <EmptyState message="Da de alta un propietario en Ajustes antes de generar informes." />
      ) : (
        <ReportForm owners={owners} basePath={basePath} />
      )}
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/ui";
import ReportForm from "@/components/ReportForm";

export default async function ReportsPage() {
  const { organizationId } = await requireBusinessContext();
  const owners = await prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Informes por propietario"
        subtitle="Genera un informe semanal o mensual listo para imprimir o enviar, con los totales calculados automáticamente."
      />
      {owners.length === 0 ? (
        <EmptyState message="Da de alta un propietario en Ajustes antes de generar informes." />
      ) : (
        <ReportForm owners={owners} />
      )}
    </div>
  );
}

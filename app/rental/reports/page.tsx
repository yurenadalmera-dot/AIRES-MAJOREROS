import { requireBusinessContext } from "@/lib/business-context";
import OwnerReportsView from "@/components/shared/OwnerReportsView";

export default async function RentalReportsPage() {
  const { organizationId } = await requireBusinessContext();

  return (
    <OwnerReportsView
      organizationId={organizationId}
      basePath="/rental"
      subtitle="Genera un informe semanal o mensual listo para imprimir o enviar, con los totales calculados automáticamente."
    />
  );
}

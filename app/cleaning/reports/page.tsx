import { requireBusinessContext } from "@/lib/business-context";
import OwnerReportsView from "@/components/shared/OwnerReportsView";

export default async function CleaningReportsPage() {
  const { organizationId } = await requireBusinessContext();

  return (
    <OwnerReportsView
      organizationId={organizationId}
      basePath="/cleaning"
      subtitle="Mismo informe que ve la operativa de alquiler, consultable desde aquí: incluye el detalle de limpiezas del periodo por vivienda."
    />
  );
}

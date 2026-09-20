import { requireBusinessContext } from "@/lib/business-context";
import TasksBoardView from "@/components/shared/TasksBoardView";

export default async function RentalTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.estado_tarea");
  const params = await searchParams;

  return (
    <TasksBoardView
      organizationId={organizationId}
      params={params}
      subtitle="Asignación de tareas a empleadas. Las limpiezas hechas alimentan automáticamente la facturación del negocio de limpiezas."
    />
  );
}

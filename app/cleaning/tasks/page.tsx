import { requireBusinessContext } from "@/lib/business-context";
import TasksBoardView from "@/components/shared/TasksBoardView";

// Misma vista y mismos datos que /rental/tasks: es la empresa que gestiona y
// factura las limpiezas, así que necesita consultar y asignar las tareas.
export default async function CleaningTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { organizationId } = await requireBusinessContext();
  const params = await searchParams;

  return (
    <TasksBoardView
      organizationId={organizationId}
      params={params}
      subtitle="Tareas gestionadas por la empresa de limpiezas. Es el mismo registro que ve la operativa de alquiler: al marcar una limpieza como hecha pasa automáticamente a facturación."
    />
  );
}

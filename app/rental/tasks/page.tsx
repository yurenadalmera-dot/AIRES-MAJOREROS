import { requireBusinessContext } from "@/lib/business-context";
import TasksBoardView from "@/components/shared/TasksBoardView";

/**
 * Mantenimiento, no limpiezas.
 *
 * Las limpiezas las hace y las factura Aires Majoreros, así que se gestionan
 * en su panel. Aquí queda lo que sí es de la operativa de alquiler: averías,
 * revisiones y reformas — llamar al fontanero es cosa de quien gestiona la
 * vivienda, no de quien la limpia.
 *
 * El estado de las limpiezas sigue estando a la vista en el panel del día,
 * que es donde hace falta: para saber si la casa está lista antes de que
 * llegue el huésped.
 */
export default async function RentalTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");
  const params = await searchParams;

  return (
    <TasksBoardView
      organizationId={organizationId}
      params={params}
      tipo="MAINTENANCE"
      titulo="Mantenimiento"
      subtitle="Averías, revisiones y reformas de las viviendas. Las limpiezas las gestiona Aires Majoreros; su estado se ve en el panel del día."
    />
  );
}

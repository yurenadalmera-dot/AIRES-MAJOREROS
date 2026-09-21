import { requireBusinessContext } from "@/lib/business-context";
import TasksBoardView from "@/components/shared/TasksBoardView";
import CargaPorDia from "@/components/CargaPorDia";
import { prisma } from "@/lib/prisma";

/**
 * Las limpiezas, que son el negocio de Aires Majoreros.
 *
 * Aquí se asignan, se marcan como hechas y, al marcarlas, pasan solas a
 * facturación. Cada fila lleva lo que hace falta para trabajar y para cobrar:
 * si es salida o repaso, y con cuántos huéspedes — que es con lo que cobra la
 * tarifa.
 */
export default async function CleaningTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { organizationId } = await requireBusinessContext("operativa.estado_tarea");
  const params = await searchParams;

  const proximas = await prisma.cleaningTask.findMany({
    where: {
      organizationId,
      type: "CLEANING",
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { date: true },
  });

  return (
    <>
      <CargaPorDia fechas={proximas.map((t) => t.date.toISOString())} />
      <TasksBoardView
        organizationId={organizationId}
        params={params}
        tipo="CLEANING"
        titulo="Limpiezas"
        subtitle="Las limpiezas que genera cada salida. Al marcar una como hecha pasa automáticamente a facturación."
      />
    </>
  );
}

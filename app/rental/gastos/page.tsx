import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import Gastos from "@/components/Gastos";

export default async function GastosPage() {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");

  const [viviendas, gastos] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expense.findMany({
      where: { organizationId },
      orderBy: { date: "desc" },
      take: 200,
      include: { property: { select: { name: true } } },
    }),
  ]);

  const visibles = gastos.map((g) => ({
    id: g.id,
    date: g.date.toISOString(),
    concept: g.concept,
    supplier: g.supplier,
    amount: Number(g.amount),
    propertyName: g.property?.name ?? "—",
  }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Gastos"
        subtitle="Lo que se gasta en cada vivienda. Entra en el informe al propietario y baja la base sobre la que se calcula la comisión de gestión."
      />
      <Gastos
        viviendas={viviendas}
        gastos={visibles}
        total={visibles.reduce((s, g) => s + g.amount, 0)}
      />
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import PropertyForm from "@/components/PropertyForm";
import { createProperty } from "@/lib/actions/properties";

export default async function NewPropertyPage() {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");
  const owners = await prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });

  const grupos = (
    await prisma.propertyGroup.findMany({
      where: { organizationId },
      orderBy: [{ owner: { name: "asc" } }, { name: "asc" }],
      include: { owner: { select: { name: true } } },
    })
  ).map((g) => ({
    id: g.id,
    name: g.name,
    ownerName: g.owner.name,
    managementPct: g.managementPct === null ? null : Number(g.managementPct),
  }));

  return (
    <div className="max-w-2xl">
      <PageHeader title="Nueva vivienda" />
      <PropertyForm owners={owners} groups={grupos} action={createProperty} redirectTo="/rental/properties" />
    </div>
  );
}

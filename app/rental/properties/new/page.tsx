import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import PropertyForm from "@/components/PropertyForm";
import { createProperty } from "@/lib/actions/properties";

export default async function NewPropertyPage() {
  const { organizationId } = await requireBusinessContext();
  const owners = await prisma.owner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Nueva vivienda" />
      <PropertyForm owners={owners} action={createProperty} redirectTo="/rental/properties" />
    </div>
  );
}

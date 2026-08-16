import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BUSINESS_TYPES } from "@/lib/constants";

/**
 * Carga la sesión activa y los nombres visibles de los dos negocios de la
 * organización, para pintar el conmutador y las cabeceras sin hardcodear
 * "Emma Ferrer" / "Aires Majoreros" en el código de la interfaz.
 */
export async function requireBusinessContext() {
  const session = await getSession();
  if (!session) redirect("/login");

  const businesses = await prisma.business.findMany({
    where: { organizationId: session.organizationId },
  });

  const rental = businesses.find((b) => b.type === BUSINESS_TYPES.RENTAL_MANAGEMENT);
  const cleaning = businesses.find((b) => b.type === BUSINESS_TYPES.CLEANING_BILLING);

  return {
    session,
    organizationId: session.organizationId,
    rentalBusiness: rental ?? null,
    cleaningBusiness: cleaning ?? null,
  };
}

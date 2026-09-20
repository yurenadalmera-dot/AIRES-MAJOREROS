import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BUSINESS_TYPES } from "@/lib/constants";
import { puede, type Permiso } from "@/lib/permisos";

/**
 * Carga la sesión activa y los nombres visibles de los dos negocios de la
 * organización, para pintar el conmutador y las cabeceras sin hardcodear
 * "Emma Ferrer" / "Aires Majoreros" en el código de la interfaz.
 */
export async function requireBusinessContext(permiso?: Permiso) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Las acciones ya exigen permiso, pero **leer** también importa: sin esto,
  // quien limpia podía escribir /cleaning/invoices en la barra de direcciones
  // y ver la facturación entera. Se le manda a donde sí puede estar en lugar
  // de enseñarle un error.
  if (permiso && !puede(session.role, permiso)) {
    redirect(primeraRutaPermitida(session.role));
  }

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

/** Dónde mandar a alguien que no puede estar donde ha entrado. */
export function primeraRutaPermitida(rol: string): string {
  if (puede(rol, "operativa.alquiler")) return "/rental";
  if (puede(rol, "facturacion")) return "/cleaning";
  if (puede(rol, "operativa.estado_tarea")) return "/cleaning/tasks";
  return "/login";
}

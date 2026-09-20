import { prisma } from "./prisma";

/**
 * Los datos de demostración que sembró el primer arranque.
 *
 * La base se creó vacía y el arranque la llenó con siete viviendas, diecisiete
 * reservas y un puñado de propietarios inventados, para que la aplicación se
 * pudiera enseñar y probar. Son útiles hasta el día en que entra gente de
 * verdad: a partir de ahí estorban, porque se mezclan con lo real.
 *
 * Se reconocen por el correo de los propietarios. La siembra usa dominios
 * reservados para ejemplos (RFC 2606, RFC 6761): nadie real los tiene, así que
 * no hay forma de confundir un propietario inventado con uno auténtico.
 */
const DOMINIOS_DE_EJEMPLO = ["@example.com", "@example.org", "@example.net", ".example"];

/**
 * Lo que hay que escribir para confirmar que se vacía todo.
 *
 * Vive aquí y no junto a la acción porque un fichero «use server» solo puede
 * exportar funciones asíncronas.
 */
export const PALABRA_DE_CONFIRMACION = "BORRAR";

export async function hayDatosDeDemostracion(organizationId: string): Promise<boolean> {
  const propietarios = await prisma.owner.findMany({
    where: { organizationId },
    select: { email: true },
  });
  return propietarios.some((p) => esCorreoDeEjemplo(p.email));
}

function esCorreoDeEjemplo(correo: string | null | undefined): boolean {
  if (!correo) return false;
  const c = correo.toLowerCase();
  return DOMINIOS_DE_EJEMPLO.some((d) => c.endsWith(d));
}

export interface ResumenDeDatos {
  viviendas: number;
  propietarios: number;
  reservas: number;
  tareas: number;
  facturas: number;
  personal: number;
  socias: number;
}

export async function resumenDeDatos(organizationId: string): Promise<ResumenDeDatos> {
  const [viviendas, propietarios, reservas, tareas, facturas, personal, socias] =
    await Promise.all([
      prisma.property.count({ where: { organizationId } }),
      prisma.owner.count({ where: { organizationId } }),
      prisma.booking.count({ where: { organizationId } }),
      prisma.cleaningTask.count({ where: { organizationId } }),
      prisma.invoice.count({ where: { organizationId } }),
      prisma.employee.count({ where: { organizationId } }),
      prisma.partner.count({ where: { organizationId } }),
    ]);
  return { viviendas, propietarios, reservas, tareas, facturas, personal, socias };
}

/**
 * Borra todo lo operativo y deja la aplicación como el primer día, pero vacía.
 *
 * **No toca las cuentas de acceso ni los datos fiscales de las dos empresas**:
 * quien entra sigue entrando, y el CIF, la dirección y el número de factura
 * siguen donde estaban. Lo que se va son las viviendas, los propietarios, las
 * reservas, las limpiezas, las facturas emitidas, el personal y las socias.
 *
 * El orden importa: primero lo que apunta a otras cosas, después lo apuntado,
 * o la base rechaza el borrado por las claves foráneas.
 */
export async function vaciarDatosDeOperacion(organizationId: string): Promise<ResumenDeDatos> {
  const antes = await resumenDeDatos(organizationId);

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoice: { organizationId } } }),
    prisma.cleaningTask.deleteMany({ where: { organizationId } }),
    prisma.invoice.deleteMany({ where: { organizationId } }),
    prisma.booking.deleteMany({ where: { organizationId } }),
    prisma.partnerSplitConfig.deleteMany({ where: { organizationId } }),
    prisma.partner.deleteMany({ where: { organizationId } }),
    prisma.employee.deleteMany({ where: { organizationId } }),
    prisma.property.deleteMany({ where: { organizationId } }),
    prisma.owner.deleteMany({ where: { organizationId } }),
  ]);

  return antes;
}

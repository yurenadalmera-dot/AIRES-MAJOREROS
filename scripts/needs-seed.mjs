/**
 * Imprime "yes" si la base de datos está vacía y procede sembrarla, o "no" en
 * cualquier otro caso. Lo usa docker-entrypoint.sh para sembrar únicamente en
 * el primer arranque y no volver a tocar los datos en redespliegues
 * posteriores: el seed borra y recrea todo, así que solo debe ejecutarse sobre
 * una base de datos sin contenido.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });

try {
  const count = await prisma.organization.count();
  process.stdout.write(count === 0 ? "yes" : "no");
} catch {
  // Si la consulta falla (tabla inexistente, base corrupta...) se opta por no
  // sembrar: es preferible que la app falle de forma visible a arriesgarse a
  // borrar datos existentes.
  process.stdout.write("no");
} finally {
  await prisma.$disconnect();
}

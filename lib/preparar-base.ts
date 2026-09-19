/* eslint-disable no-console */
//
// Crea el esquema de la base de datos si todavía no existe.
//
// Esto lo haría normalmente `prisma db push` durante el despliegue, pero aquí
// no se puede: el build de Hostinger corre en un contenedor aparte y esta base
// solo acepta conexiones desde el propio servidor de hosting. El único proceso
// con acceso es la propia aplicación, así que el esquema se aplica al arrancar
// (ver `instrumentation.ts`).
//
// Las sentencias están en `lib/esquema-inicial.ts`, generado por Prisma sin
// conectar a nada. Ver la cabecera de ese fichero para regenerarlo.
import { PrismaClient } from "@prisma/client";
import { SENTENCIAS_ESQUEMA_INICIAL } from "./esquema-inicial";

const prisma = new PrismaClient();

/** Nombre del cerrojo de MySQL. Passenger arranca varios procesos a la vez. */
const CERROJO = "aires_preparar_base";

async function hayEsquema(): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'User'
  `;
  return Number(filas[0]?.n ?? 0) > 0;
}

/**
 * Aplica el esquema si falta. Devuelve true si lo ha creado en esta llamada.
 *
 * Es idempotente y nunca destruye nada: si las tablas ya están, no toca la
 * base. Un cambio de esquema posterior NO se aplica aquí — eso sigue siendo
 * `prisma db push` ejecutado a mano contra la base.
 */
export async function crearEsquemaSiFalta(): Promise<boolean> {
  if (await hayEsquema()) return false;

  // Varios procesos de Passenger arrancan a la vez; solo uno debe crear las
  // tablas. Los demás esperan aquí y al entrar ya encuentran el esquema hecho.
  const [{ cerrojo }] = await prisma.$queryRaw<{ cerrojo: number | null }[]>`
    SELECT GET_LOCK(${CERROJO}, 60) AS cerrojo
  `;
  if (cerrojo !== 1) {
    throw new Error("No se ha podido tomar el cerrojo para preparar la base de datos.");
  }

  try {
    if (await hayEsquema()) return false;

    console.log(`🔧 Creando el esquema: ${SENTENCIAS_ESQUEMA_INICIAL.length} sentencias.`);
    for (const sentencia of SENTENCIAS_ESQUEMA_INICIAL) {
      await prisma.$executeRawUnsafe(sentencia);
    }
    console.log("✅ Esquema creado.");
    return true;
  } finally {
    await prisma.$queryRaw`SELECT RELEASE_LOCK(${CERROJO})`;
  }
}

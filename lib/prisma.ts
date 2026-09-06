import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDemoMode } from "@/lib/demo-mode";

// En modo demo (ver lib/demo-mode.ts) se trabaja sobre una copia en el
// directorio temporal del sistema de la base de datos sembrada que viaja dentro
// del despliegue, porque el resto del sistema de ficheros puede ser de solo
// lectura (serverless) o quedar sobrescrito en cada despliegue.
const DEMO_DB_PATH = path.join(os.tmpdir(), "demo.db");

function seededDbPath(): string {
  return path.join(process.cwd(), "prisma", "preview-seed.db");
}

export class DemoSeedMissingError extends Error {
  constructor(seedPath: string) {
    super(
      `Modo demo activado pero falta ${seedPath}. Se genera durante 'npm run build' ` +
        `(o a mano con 'npm run db:preview-seed'); comprueba que el despliegue incluye ` +
        `la carpeta prisma/.`
    );
    this.name = "DemoSeedMissingError";
  }
}

function resolveDemoDatabaseUrl(): string {
  const seeded = seededDbPath();
  if (!fs.existsSync(seeded)) {
    throw new DemoSeedMissingError(seeded);
  }

  // Se rehace la copia si no existe o si quedó obsoleta respecto a la base de
  // datos sembrada: en un servidor de larga vida (no serverless) el directorio
  // temporal sobrevive a los despliegues, y una copia vieja —o truncada por un
  // despliegue interrumpido— dejaría la aplicación sin los usuarios de demo.
  const copy = fs.existsSync(DEMO_DB_PATH) ? fs.statSync(DEMO_DB_PATH) : null;
  const source = fs.statSync(seeded);
  const stale = !copy || copy.size === 0 || copy.mtimeMs < source.mtimeMs;
  if (stale) {
    // Los ficheros auxiliares de SQLite de la copia anterior no valen para la
    // nueva y la dejarían inconsistente.
    for (const sidecar of ["-journal", "-wal", "-shm"]) {
      fs.rmSync(`${DEMO_DB_PATH}${sidecar}`, { force: true });
    }
    fs.copyFileSync(seeded, DEMO_DB_PATH);
    fs.chmodSync(DEMO_DB_PATH, 0o600);
  }

  return `file:${DEMO_DB_PATH}`;
}

function createClient(): PrismaClient {
  const log: ("error" | "warn")[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  if (isDemoMode()) {
    return new PrismaClient({ log, datasources: { db: { url: resolveDemoDatabaseUrl() } } });
  }
  return new PrismaClient({ log });
}

// Evita crear múltiples instancias de PrismaClient en desarrollo (hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

// El cliente se crea de forma perezosa, en el primer uso real. Así un fallo de
// configuración (por ejemplo, faltar la base de datos de demostración) se lanza
// dentro del código que consulta —que puede capturarlo y responder con un
// mensaje útil— y no al importar el módulo, donde solo produciría un 500 opaco.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

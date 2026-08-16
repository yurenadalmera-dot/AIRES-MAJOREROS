import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { isDemoMode } from "@/lib/demo-mode";

// En modo demo (ver lib/demo-mode.ts) se trabaja sobre una copia en /tmp de la
// base de datos sembrada que viaja dentro del despliegue, porque el resto del
// sistema de ficheros es de solo lectura en serverless.
const DEMO_DB_PATH = "/tmp/demo.db";

function resolveDemoDatabaseUrl(): string {
  if (!fs.existsSync(DEMO_DB_PATH)) {
    const seeded = path.join(process.cwd(), "prisma", "preview-seed.db");
    if (!fs.existsSync(seeded)) {
      throw new Error(
        "Modo demo activado pero falta prisma/preview-seed.db. Genéralo con 'npm run db:preview-seed'."
      );
    }
    fs.copyFileSync(seeded, DEMO_DB_PATH);
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

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

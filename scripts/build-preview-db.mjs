/**
 * Genera `prisma/preview-seed.db`: una base de datos SQLite ya sembrada que se
 * incluye en el despliegue de la vista previa. En tiempo de ejecución se copia
 * a /tmp (lo único escribible en serverless) y la aplicación trabaja sobre esa
 * copia. Ver la explicación completa en lib/prisma.ts.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Con una base de datos PostgreSQL real configurada no hace falta la base de
// datos de demostración: el despliegue no está en modo demo.
if ((process.env.DATABASE_URL ?? "").startsWith("postgres")) {
  console.log("→ DATABASE_URL apunta a PostgreSQL: se omite la base de datos de vista previa.");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = path.join(root, "prisma", "preview-seed.db");

// Ruta relativa al directorio del schema, que es como Prisma resuelve `file:`.
const url = "file:./preview-seed.db";
const env = { ...process.env, DATABASE_URL: url };

function run(command, args) {
  execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
}

fs.rmSync(dbFile, { force: true });

console.log("→ Creando esquema en la base de datos de vista previa...");
run("npx", ["prisma", "db", "push", "--force-reset", "--skip-generate"]);

console.log("→ Sembrando datos de demostración...");
run("npx", ["tsx", "prisma/seed.ts"]);

if (!fs.existsSync(dbFile)) {
  throw new Error(`No se generó ${dbFile}`);
}
const sizeKb = Math.round(fs.statSync(dbFile).size / 1024);
console.log(`✅ prisma/preview-seed.db listo (${sizeKb} KB)`);

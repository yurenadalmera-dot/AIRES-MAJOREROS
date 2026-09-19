/* eslint-disable no-console */
//
// Envoltorio de línea de órdenes para la siembra. La lógica vive en
// `lib/seed-datos.ts`, porque en producción quien la ejecuta no es este script
// sino el arranque del servidor (`instrumentation.ts`).
//
//   npm run db:seed            → no toca nada si ya hay datos
//   npm run db:seed -- --force → BORRA las 13 tablas y vuelve a sembrar
import { prepararDatos } from "../lib/seed-datos";

const forzar = process.argv.includes("--force") || process.env.SEED_FORCE === "1";

prepararDatos({ forzar })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/**
 * Modo demo autocontenido.
 *
 * Permite publicar una vista previa navegable de la aplicación sin depender de
 * una base de datos externa ni de configurar variables de entorno: la base de
 * datos viaja ya sembrada dentro del despliegue y se copia al directorio
 * temporal del sistema (lo único escribible en un entorno serverless) en el
 * primer arranque de cada instancia.
 *
 * Es un entorno de pruebas, no de producción: los cambios persisten mientras la
 * instancia siga viva y vuelven a los datos de ejemplo al arrancar una nueva.
 *
 * Reglas de activación (en este orden):
 *
 *  1. `DEMO_MODE=1` / `DEMO_MODE=0` mandan siempre: sirven para forzarlo o para
 *     desactivarlo en un despliegue propio con base de datos SQLite ya sembrada.
 *  2. Con un `DATABASE_URL` de un motor de servidor real (PostgreSQL, MySQL...)
 *     el modo demo se desactiva solo.
 *  3. Fuera de producción (`npm run dev`) nunca se activa: en local se trabaja
 *     contra `prisma/dev.db` con `npm run db:reset`.
 *  4. En cualquier otro caso —un build de producción desplegado sin base de
 *     datos configurada, sea Vercel, Hostinger o cualquier otro hosting Node—
 *     se activa, para que la aplicación arranque con los datos de ejemplo en
 *     lugar de fallar al primer acceso a base de datos.
 *
 * Este módulo lo importa también `middleware.ts`, que se ejecuta en el runtime
 * Edge: no puede usar `node:fs` ni ninguna otra API exclusiva de Node.
 */
export function isDemoMode(): boolean {
  const explicit = (process.env.DEMO_MODE ?? "").toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;

  if (hasServerDatabase()) return false;
  if (process.env.NODE_ENV !== "production") return false;
  return true;
}

/**
 * ¿`DATABASE_URL` apunta a un motor de base de datos de servidor real? Un
 * `file:` (SQLite) no cuenta: en un despliegue es casi siempre el valor por
 * defecto de `.env.example`, apuntando a un fichero que no existe allí.
 */
export function hasServerDatabase(): boolean {
  return /^(postgres|postgresql|mysql|sqlserver|mongodb):/i.test(process.env.DATABASE_URL ?? "");
}

/**
 * Secreto de sesión de respaldo, exclusivo del modo demo. En cualquier
 * despliegue real AUTH_SECRET debe definirse como variable de entorno; fuera
 * del modo demo su ausencia es un error, no se sustituye por nada.
 */
export const DEMO_AUTH_SECRET =
  "modo-demo-secreto-no-apto-para-produccion-solo-datos-ficticios";

/** Secreto efectivo para firmar/verificar la cookie de sesión, o `null`. */
export function resolveAuthSecret(): string | null {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.trim() !== "") return configured;
  return isDemoMode() ? DEMO_AUTH_SECRET : null;
}

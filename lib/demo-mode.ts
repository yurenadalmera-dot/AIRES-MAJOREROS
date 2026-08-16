/**
 * Modo demo autocontenido.
 *
 * Permite publicar una vista previa navegable de la aplicación sin depender de
 * una base de datos externa ni de configurar variables de entorno: la base de
 * datos viaja ya sembrada dentro del despliegue y se copia a /tmp (lo único
 * escribible en un entorno serverless) en el primer arranque de cada instancia.
 *
 * Es un entorno de pruebas, no de producción: los cambios persisten mientras la
 * instancia siga viva y vuelven a los datos de ejemplo al arrancar una nueva.
 *
 * Se activa cuando se pide explícitamente (DEMO_MODE=1) o cuando se despliega
 * en Vercel sin haber configurado una base de datos PostgreSQL real. En cuanto
 * se define un DATABASE_URL de PostgreSQL, la aplicación pasa a usarlo y el modo
 * demo se desactiva solo.
 */
export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "1") return true;
  const hasRealDatabase = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  return process.env.VERCEL === "1" && !hasRealDatabase;
}

/**
 * Secreto de sesión de respaldo, exclusivo del modo demo. En cualquier
 * despliegue real AUTH_SECRET debe definirse como variable de entorno; fuera
 * del modo demo su ausencia es un error, no se sustituye por nada.
 */
export const DEMO_AUTH_SECRET =
  "modo-demo-secreto-no-apto-para-produccion-solo-datos-ficticios";

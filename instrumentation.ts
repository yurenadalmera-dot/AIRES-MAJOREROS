/* eslint-disable no-console */
//
// Next.js ejecuta esto una vez al arrancar cada proceso del servidor, antes de
// atender ninguna petición. Es el sitio donde se prepara la base de datos.
//
// No es el sitio natural —lo normal sería hacerlo en el despliegue— pero es el
// único posible aquí: la base solo acepta conexiones desde el servidor de
// hosting, y el build corre en otro sitio. Ver `lib/preparar-base.ts`.
//
// Nunca tumba el servidor: si la preparación falla, se registra el error y la
// aplicación arranca igual. Un sitio que responde «no hay base de datos» se
// diagnostica; uno que no arranca, no.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DB_AUTO_SETUP === "0") return;

  // Diagnóstico temporal: distingue «la variable de entorno no es la que creo»
  // de «la contraseña de la base no es la que creo». No imprime la contraseña,
  // solo su longitud, que es lo que hace falta para comparar.
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    console.log(
      `🔎 DATABASE_URL: usuario=${url.username} host=${url.hostname}:${url.port} ` +
        `base=${url.pathname.slice(1)} longitud_contraseña=${decodeURIComponent(url.password).length}`
    );
  } catch {
    console.log("🔎 DATABASE_URL ausente o con formato inválido.");
  }

  try {
    const { crearEsquemaSiFalta } = await import("./lib/preparar-base");
    const { prepararDatos } = await import("./lib/seed-datos");

    const recienCreado = await crearEsquemaSiFalta();
    if (recienCreado) {
      await prepararDatos();
    } else {
      // El esquema ya estaba: no se siembra (la siembra ya se protege sola),
      // pero sí se revisa la cuenta de administración, que es lo que permite
      // recuperar el acceso cambiando ADMIN_PASSWORD y reiniciando.
      const { asegurarAdministrador } = await import("./lib/seed-datos");
      await asegurarAdministrador();
    }
  } catch (error) {
    console.error(
      "⚠️  No se ha podido preparar la base de datos al arrancar:",
      error instanceof Error ? error.message : error
    );
  }
}

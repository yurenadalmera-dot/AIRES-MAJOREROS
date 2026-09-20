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

  // Con SELFTEST=1, la aplicación se prueba a sí misma unos segundos después
  // de arrancar (cuando ya escucha) y deja el resultado en los logs. Ver
  // `lib/autoprueba.ts`.
  if (process.env.SELFTEST === "1") {
    setTimeout(() => {
      import("./lib/autoprueba").then(({ autoprueba }) => autoprueba());
    }, 5000).unref?.();
  }

  if (process.env.DB_AUTO_SETUP === "0") return;

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
      const { aplicarMigraciones } = await import("./lib/migraciones");
      await aplicarMigraciones();

      const { asegurarAdministrador, retirarUsuariosDemo } = await import("./lib/seed-datos");
      await asegurarAdministrador();
      await retirarUsuariosDemo();
    }
  } catch (error) {
    console.error(
      "⚠️  No se ha podido preparar la base de datos al arrancar:",
      error instanceof Error ? error.message : error
    );
    // Si el mensaje es «Authentication failed», lo primero que hay que mirar no
    // es la contraseña sino el host de DATABASE_URL: tiene que ser `localhost`.
    // Ver README, «Cómo se prepara la base de datos».
  }
}

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

    // Las migraciones se pasan siempre, también sobre una base recién creada.
    // Antes solo corrían sobre una base que ya existía, y eso escondía una
    // trampa: una tabla nueva que solo estuviera en `lib/migraciones.ts` no
    // llegaba nunca a una instalación desde cero. Como cada migración mira
    // antes si hace falta, sobre una base recién hecha no son más que unas
    // cuantas consultas a information_schema.
    const { aplicarMigraciones } = await import("./lib/migraciones");
    await aplicarMigraciones();

    if (recienCreado) {
      await prepararDatos();
    } else {
      // El esquema ya estaba: no se siembra (la siembra ya se protege sola),
      // pero sí se revisa la cuenta de administración, que es lo que permite
      // recuperar el acceso cambiando ADMIN_PASSWORD y reiniciando.
      const { asegurarAdministrador, retirarUsuariosDemo } = await import("./lib/seed-datos");
      await asegurarAdministrador();
      await retirarUsuariosDemo();
    }

    // Las cuentas del equipo. Solo crea las que falten; una que ya existe no
    // se toca. Ver `lib/altas-iniciales.ts`.
    const { crearAltasIniciales } = await import("./lib/altas-iniciales");
    await crearAltasIniciales();
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

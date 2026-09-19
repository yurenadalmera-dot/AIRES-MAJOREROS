/* eslint-disable no-console */
//
// Prueba de extremo a extremo que la aplicación se hace a sí misma, contra su
// propio servidor HTTP, y deja el resultado en los logs de Node.js.
//
// Existe porque el dominio no siempre es alcanzable desde donde se desarrolla
// (proxys, redes cerradas), y entonces no hay forma de comprobar si el login
// funciona de verdad salvo pedírselo a alguien. Esto lo comprueba desde
// dentro, pasando por el mismo HTTP, las mismas cookies y las mismas páginas
// que vería una persona.
//
// Solo corre con SELFTEST=1. No modifica nada.

const BASE = process.env.SELFTEST_BASE ?? "http://127.0.0.1:3000";

const PAGINAS = [
  "/rental",
  "/rental/calendar",
  "/rental/properties",
  "/rental/bookings",
  "/rental/reports",
  "/cleaning",
  "/cleaning/tasks",
  "/cleaning/invoices",
];

export async function autoprueba() {
  const linea: string[] = [];
  const fallos: string[] = [];

  try {
    // 1 · Estado de la base de datos
    const salud = await fetch(`${BASE}/api/health/db`);
    const cuerpo = await salud.json();
    linea.push(`salud=${salud.status} ok=${cuerpo.ok} usuarios=${cuerpo.usuarios}`);
    if (!cuerpo.ok) fallos.push("la comprobación de base de datos no responde ok");

    // 2 · Login real con la cuenta de administración
    const email = process.env.ADMIN_EMAIL ?? "info@airesmajoreros.pro";
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      console.log("🧪 AUTOPRUEBA: sin ADMIN_PASSWORD, no se puede probar el login.");
      return;
    }

    const entrada = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
    linea.push(`login=${entrada.status}`);
    if (entrada.status !== 200 || !cookie) fallos.push("el login del administrador no entra");

    // 3 · Una contraseña equivocada debe ser rechazada
    const malo = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "esto-no-es-la-contraseña" }),
    });
    linea.push(`login_incorrecto=${malo.status}`);
    if (malo.status === 200) fallos.push("¡una contraseña equivocada entra!");

    // 4 · Las páginas cargan con sesión
    for (const ruta of PAGINAS) {
      const r = await fetch(`${BASE}${ruta}`, { headers: { cookie }, redirect: "manual" });
      linea.push(`${ruta}=${r.status}`);
      if (r.status !== 200) fallos.push(`${ruta} responde ${r.status}`);
    }

    // 5 · Sin sesión, redirige al login
    const sinSesion = await fetch(`${BASE}/rental`, { redirect: "manual" });
    linea.push(`sin_sesion=${sinSesion.status}`);
    if (sinSesion.status !== 307 && sinSesion.status !== 302) {
      fallos.push("sin sesión no redirige al login");
    }

    console.log(`🧪 AUTOPRUEBA · ${linea.join(" ")}`);
    console.log(
      fallos.length === 0
        ? "🧪 AUTOPRUEBA: TODO CORRECTO"
        : `🧪 AUTOPRUEBA: ${fallos.length} FALLOS · ${fallos.join(" | ")}`
    );
  } catch (error) {
    console.log(
      `🧪 AUTOPRUEBA: no se ha podido completar: ${
        error instanceof Error ? error.message : error
      } · ${linea.join(" ")}`
    );
  }
}

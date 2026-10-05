/**
 * Las reglas de las contraseñas y de recuperar el acceso.
 *
 * Están aquí, aparte de la base de datos y de las pantallas, por lo mismo que
 * `lib/cuenta-admin.ts`: son las reglas que deciden si alguien entra o se
 * queda fuera, y eso merece una prueba que corra en cada push sin necesitar
 * base de datos.
 *
 * Nada de este fichero toca Node ni Prisma: lo importan también las pantallas.
 */

/** Mínimo razonable para una herramienta interna. */
export const MINIMO_CONTRASENA = 10;

/**
 * Lo que dura el enlace de «he olvidado mi contraseña».
 *
 * Media hora: lo bastante para abrir el correo con calma, y lo bastante poco
 * para que un enlace olvidado en un buzón no sea una llave que sigue sirviendo
 * la semana que viene.
 */
export const MINUTOS_DE_VALIDEZ_DEL_ENLACE = 30;

/**
 * Cuántas veces puede pedir alguien el enlace en una hora.
 *
 * Sin tope, quien conozca el correo de otra persona puede llenarle el buzón
 * pulsando el botón, y de paso gastar el cupo de envío de la cuenta de correo.
 */
export const MAX_SOLICITUDES_POR_HORA = 3;

export function puedePedirOtroEnlace(solicitudesEnLaUltimaHora: number): boolean {
  return solicitudesEnLaUltimaHora < MAX_SOLICITUDES_POR_HORA;
}

/**
 * ¿Puede esta cuenta recuperar el acceso con un enlace por correo?
 *
 * **La de administración, no.** El enlace no lo manda la aplicación: se lo da
 * a n8n, que pasa a recogerlo con el token de Ajustes. Si ese enlace pudiera
 * ser el de administración, ese token —que está guardado fuera de aquí y hasta
 * ahora solo servía para importar datos— pasaría a ser una llave maestra:
 * quien lo tuviera podría pedir el enlace, recogerlo él mismo y quedarse con
 * la aplicación entera sin que saliera un solo correo.
 *
 * Administración recupera el acceso como siempre, desde las variables de
 * entorno del hosting (`ADMIN_PASSWORD_RESET`), que exige estar dentro del
 * panel de Hostinger.
 */
export function puedeRecuperarPorCorreo(rol: string): boolean {
  return rol !== "ADMIN";
}

/**
 * ¿Sirve todavía este enlace?
 *
 * Tres formas de que no sirva, y por fuera las tres dan el mismo mensaje:
 * decir cuál de ellas es le diría a quien prueba enlaces cuándo ha acertado.
 */
export function enlaceUtilizable(
  enlace: { caducaEl: Date | null; usadaEl: Date | null; usuarioActivo: boolean },
  ahora: Date = new Date()
): boolean {
  if (enlace.usadaEl) return false; // un solo uso
  if (!enlace.caducaEl) return false; // todavía no se ha llegado a enviar
  if (enlace.caducaEl.getTime() <= ahora.getTime()) return false;
  return enlace.usuarioActivo; // a quien se ha dado de baja no le abre nada
}

/** Por qué no vale una contraseña nueva, o `null` si vale. */
export function motivoContrasenaNoValida(nueva: string, repetida: string): string | null {
  if (nueva.length < MINIMO_CONTRASENA) {
    return `La nueva contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`;
  }
  if (nueva !== repetida) {
    return "La nueva contraseña y su repetición no coinciden.";
  }
  return null;
}

/**
 * Adónde va alguien nada más entrar.
 *
 * Quien entra con una contraseña de un solo uso no va a ningún sitio hasta que
 * se ponga la suya: ni a donde iba (`next`), ni a su panel.
 *
 * `next` viene de la barra de direcciones, así que lo escribe cualquiera. Solo
 * se acepta si es una ruta de esta misma aplicación: con «//otro-sitio.com» o
 * una dirección completa, el enlace «entra aquí» de un correo falso llevaría
 * al login de verdad y, después de entrar, a donde quisiera quien lo mandó.
 */
export function destinoTrasEntrar({
  debeCambiar,
  next,
  inicio,
}: {
  debeCambiar: boolean;
  next: string | null | undefined;
  inicio: string | null | undefined;
}): string {
  if (debeCambiar) return "/cuenta";
  if (next && esRutaPropia(next)) return next;
  return inicio && esRutaPropia(inicio) ? inicio : "/rental";
}

/**
 * ¿Es una ruta de esta aplicación, y no una dirección de fuera disfrazada?
 *
 * No basta con que empiece por una barra y no por dos. El navegador **quita los
 * tabuladores y los saltos de línea** antes de interpretar una dirección, así
 * que «/⇥/otro-sitio.com» —una barra, un tabulador, otra barra— pasa por ruta
 * propia y acaba siendo «//otro-sitio.com». Por eso, además de rechazar los
 * caracteres de control, se le pregunta al mismo intérprete de direcciones que
 * usará el navegador a qué sitio apunta de verdad.
 */
export function esRutaPropia(ruta: string): boolean {
  if (!ruta.startsWith("/") || ruta.startsWith("//")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(ruta)) return false;
  try {
    const base = "https://esta-aplicacion.invalid";
    return new URL(ruta, base).origin === base;
  } catch {
    return false;
  }
}

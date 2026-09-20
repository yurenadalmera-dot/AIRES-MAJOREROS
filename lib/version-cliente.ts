/**
 * ¿Es la página que tengo abierta la misma versión que hay en el servidor?
 *
 * Cada despliegue publica una versión nueva y retira la anterior. Una página
 * que lleva un rato abierta sigue siendo la vieja, y sus botones apuntan a
 * funciones del servidor que ya no existen: al pulsar «Guardar» el servidor
 * responde «Failed to find Server Action … This request might be from an older
 * or newer deployment» y el navegador solo ve que algo ha fallado.
 *
 * Sin esto, el aviso era «No se ha podido guardar. Inténtalo de nuevo.», que
 * es el peor consejo posible: volver a intentarlo falla igual. Lo que hay que
 * hacer es recargar.
 *
 * `COMPILADO_EN` lo inyecta `next.config.mjs` al compilar, así que la página
 * lleva grabada su propia versión y puede compararla con la que dice el
 * servidor.
 */

const MIA = process.env.COMPILADO_EN ?? "";

export const AVISO_VERSION_NUEVA =
  "Se ha publicado una versión nueva de la aplicación mientras tenías esta página abierta. " +
  "Recárgala y vuelve a intentarlo.";

export async function hayVersionNueva(): Promise<boolean> {
  if (!MIA) return false;
  try {
    const respuesta = await fetch("/api/health/db", { cache: "no-store" });
    const datos = (await respuesta.json()) as { compilado?: string };
    return typeof datos.compilado === "string" && datos.compilado !== MIA;
  } catch {
    // Si no se puede preguntar, no se inventa: se deja el aviso genérico.
    return false;
  }
}

/**
 * El motivo de un fallo inesperado, en cristiano.
 *
 * Next.js oculta en producción el detalle de los errores del servidor, así que
 * lo único que se puede hacer es distinguir el caso que tiene solución
 * conocida —la página está desactualizada— del resto.
 */
export async function motivoDelFallo(): Promise<string> {
  return (await hayVersionNueva())
    ? AVISO_VERSION_NUEVA
    : "No se ha podido guardar. Inténtalo de nuevo.";
}

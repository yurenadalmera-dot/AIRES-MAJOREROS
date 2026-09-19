// Errores que el usuario tiene que poder leer.
//
// Next.js oculta en producción el mensaje de cualquier error lanzado dentro de
// una acción de servidor y lo sustituye por «An error occurred in the Server
// Components render…». Es lo correcto para un fallo inesperado —no conviene
// filtrar detalles del servidor— pero se lleva por delante los mensajes que sí
// queremos que se lean: que la vivienda ya está reservada, que la salida va
// antes que la entrada, que no se puede borrar una limpieza ya facturada.
//
// Así que los errores esperados no se lanzan: se devuelven. Quien llama a la
// acción recibe `{ error: "..." }` y lo pinta. Los inesperados se siguen
// lanzando y Next los oculta, que es lo que debe pasar con ellos.

/** Un fallo previsto, con un mensaje escrito para quien usa la aplicación. */
export class ErrorDeNegocio extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorDeNegocio";
  }
}

export type Resultado<T = void> = { error: string } | (T extends void ? void : T);

/**
 * Envuelve el cuerpo de una acción: convierte `ErrorDeNegocio` en un valor de
 * retorno y deja pasar el resto.
 */
export async function conErroresLegibles<T>(
  fn: () => Promise<T>
): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { error: e.message };
    throw e;
  }
}

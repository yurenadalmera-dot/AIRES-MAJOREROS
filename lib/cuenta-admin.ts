/**
 * Qué hacer con la cuenta de administración en cada arranque.
 *
 * Está aquí, aparte del seed, porque es la regla que decide si la contraseña
 * de alguien sobrevive a un despliegue, y eso merece una prueba que corra en
 * cada push sin necesitar base de datos.
 *
 * Durante un tiempo el arranque reescribía el hash con ADMIN_PASSWORD siempre.
 * Cambiar la contraseña desde «Mi cuenta» duraba hasta el siguiente despliegue
 * y volvía sola a la del entorno, sin avisar.
 */

export type AccionCuentaAdmin =
  /** No hay contraseña en el entorno: no se toca nada. */
  | { tipo: "nada" }
  /** La cuenta no existe todavía: se crea con la contraseña del entorno. */
  | { tipo: "crear" }
  /** Ya existe: se le devuelve el rol y se reactiva, sin tocar la contraseña. */
  | { tipo: "asegurar_acceso" }
  /** Rescate explícito: se restablece la contraseña desde el entorno. */
  | { tipo: "restablecer" };

export function decidirCuentaAdmin({
  hayContrasenaEnEntorno,
  existeLaCuenta,
  pideRestablecer,
}: {
  hayContrasenaEnEntorno: boolean;
  existeLaCuenta: boolean;
  pideRestablecer: boolean;
}): AccionCuentaAdmin {
  if (!hayContrasenaEnEntorno) return { tipo: "nada" };
  if (!existeLaCuenta) return { tipo: "crear" };
  return pideRestablecer ? { tipo: "restablecer" } : { tipo: "asegurar_acceso" };
}

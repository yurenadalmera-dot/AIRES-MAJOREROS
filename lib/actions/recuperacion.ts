"use server";

import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { motivoContrasenaNoValida } from "@/lib/acceso";
import { restablecerConEnlace } from "@/lib/recuperacion";

/**
 * Ponerse una contraseña nueva desde el enlace del correo.
 *
 * Es la única acción de la aplicación que funciona **sin sesión**, y tiene que
 * ser así: quien llega aquí es justo quien no puede entrar. Su autorización es
 * el enlace, igual que en el formulario de viajeros, y por eso de quién es la
 * cuenta sale del enlace y nunca del formulario: si viniera en un campo,
 * bastaría con cambiarlo para ponerle la contraseña a otra persona.
 */
export async function ponerContrasenaConEnlace(token: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const nueva = String(formData.get("nueva") ?? "");
    const repetida = String(formData.get("repetida") ?? "");

    const motivo = motivoContrasenaNoValida(nueva, repetida);
    if (motivo) throw new ErrorDeNegocio(motivo);

    const hecho = await restablecerConEnlace(String(token), nueva);
    if (!hecho) {
      throw new ErrorDeNegocio(
        "Este enlace ya no vale: ha caducado o ya se ha usado. Pide otro desde la pantalla de entrada."
      );
    }
    return { ok: true };
  });
}

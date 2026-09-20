"use server";

import { revalidatePath } from "next/cache";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { vaciarDatosDeOperacion, PALABRA_DE_CONFIRMACION } from "@/lib/datos-demo";

/**
 * Deja la aplicación vacía, lista para trabajar con datos reales.
 *
 * Es irreversible y no hay copia de seguridad, así que pide escribir una
 * palabra: un botón solo, por mucho que avise, se pulsa sin querer.
 */
export async function empezarDeCero(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");

    const escrito = String(formData.get("confirmacion") ?? "").trim().toUpperCase();
    if (escrito !== PALABRA_DE_CONFIRMACION) {
      throw new ErrorDeNegocio(
        `Para confirmar hay que escribir ${PALABRA_DE_CONFIRMACION} en la casilla.`
      );
    }

    const borrado = await vaciarDatosDeOperacion(organizationId);

    revalidatePath("/rental", "layout");
    revalidatePath("/cleaning", "layout");
    return { borrado };
  });
}

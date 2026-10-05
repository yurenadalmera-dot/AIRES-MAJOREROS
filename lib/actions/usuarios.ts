"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir, getSession } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import { motivoContrasenaNoValida } from "@/lib/acceso";
import { ALTAS_INICIALES } from "@/lib/altas-iniciales";

const ROLES_VALIDOS = Object.values(USER_ROLES) as string[];

/**
 * Contraseña generada por la aplicación, para entregar a alguien.
 *
 * Sin caracteres que se confundan al dictarla o copiarla a mano (l/1/I, O/0)
 * y sin símbolos, que dan problemas al pegarlos desde algunos móviles.
 */
function generarContrasena(longitud = 14): string {
  const alfabeto = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(longitud);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

const nuevoUsuarioSchema = z.object({
  name: z.string().min(1, "Falta el nombre"),
  email: z.string().email("El correo no es válido"),
  role: z.string().refine((r) => ROLES_VALIDOS.includes(r), "Rol desconocido"),
});

/**
 * Da de alta a una persona y devuelve su contraseña **una sola vez**.
 *
 * La contraseña se genera aquí y no se guarda en claro en ningún sitio: solo
 * su hash. Quien la da de alta la ve una vez, en pantalla, para entregarla. Si
 * se pierde, se restablece — no se puede recuperar.
 *
 * Es **de un solo uso**: la cuenta nace con `mustChangePassword`, y con ella
 * no se puede hacer nada más que entrar y ponerse la propia. Antes solo se
 * recomendaba cambiarla, y la que conocía administración se quedaba para
 * siempre.
 */
export async function crearUsuario(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const data = nuevoUsuarioSchema.parse(Object.fromEntries(formData.entries()));
    const email = data.email.toLowerCase().trim();

    const yaExiste = await prisma.user.findUnique({ where: { email } });
    if (yaExiste) {
      throw new ErrorDeNegocio(`Ya hay una cuenta con el correo ${email}.`);
    }

    const contrasena = generarContrasena();
    await prisma.user.create({
      data: {
        organizationId,
        name: data.name.trim(),
        email,
        passwordHash: await bcrypt.hash(contrasena, 10),
        mustChangePassword: true,
        role: data.role,
        active: true,
      },
    });

    revalidatePath("/rental/settings");
    return { creada: { email, contrasena } };
  });
}

/**
 * Restablece la contraseña de alguien y devuelve la nueva, una sola vez.
 *
 * También de un solo uso, y por el mismo motivo: la acaba de ver quien la
 * restablece.
 */
export async function restablecerContrasena(userId: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");

    // A una misma no. La contraseña nueva sale en esta pantalla, pero al
    // marcarla como de un solo uso esta pantalla deja de dejarle estar: la
    // manda a «Mi cuenta» antes de que llegue a verla, y allí se le pide
    // justo la que no ha visto. Se quedaría fuera de su propia cuenta.
    const session = await getSession();
    if (session?.userId === userId) {
      throw new ErrorDeNegocio(
        "Tu propia contraseña no se restablece desde aquí: cámbiala en «Mi cuenta» (tu nombre, arriba a la derecha)."
      );
    }

    const usuario = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { email: true },
    });
    if (!usuario) throw new ErrorDeNegocio("Usuario no encontrado");

    const contrasena = generarContrasena();
    const passwordHash = await bcrypt.hash(contrasena, 10);
    // Las dos escrituras juntas o ninguna: si la segunda fallara con la
    // primera ya hecha, la contraseña habría cambiado sin que esta pantalla
    // llegara a enseñar la nueva.
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { id: userId, organizationId },
        data: { passwordHash, mustChangePassword: true },
      }),
      // Si tenía pedido un enlace de «he olvidado mi contraseña», deja de
      // valer: con la contraseña recién restablecida ya no pinta nada, y es
      // una puerta menos abierta.
      prisma.recuperacionDeAcceso.updateMany({
        where: { userId, usadaEl: null },
        data: { usadaEl: new Date() },
      }),
    ]);

    revalidatePath("/rental/settings");
    return { creada: { email: usuario.email, contrasena } };
  });
}

export async function setUsuarioActivo(userId: string, activo: boolean) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const session = await getSession();

    // Desactivarse a uno mismo deja la casa sin llaves si además es la única
    // cuenta de administración.
    if (session?.userId === userId && !activo) {
      throw new ErrorDeNegocio("No puedes desactivar tu propia cuenta.");
    }

    if (!activo) {
      const administradoresActivos = await prisma.user.count({
        where: { organizationId, role: USER_ROLES.ADMIN, active: true },
      });
      const esAdmin = await prisma.user.findFirst({
        where: { id: userId, organizationId, role: USER_ROLES.ADMIN },
      });
      if (esAdmin && administradoresActivos <= 1) {
        throw new ErrorDeNegocio(
          "Es la única cuenta de administración activa: si la desactivas, nadie podrá gestionar la aplicación."
        );
      }
    }

    await prisma.user.updateMany({ where: { id: userId, organizationId }, data: { active: activo } });
    revalidatePath("/rental/settings");
  });
}

/**
 * Corrige el nombre con el que aparece alguien.
 *
 * Existe porque las primeras cuentas se crearon desde el arranque, con el
 * nombre que había escrito en el código: si estaba mal, no había forma de
 * arreglarlo sin tocar la base de datos.
 */
export async function cambiarNombreUsuario(userId: string, name: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const limpio = name.trim();
    if (!limpio) throw new ErrorDeNegocio("El nombre no puede quedar vacío.");

    await prisma.user.updateMany({ where: { id: userId, organizationId }, data: { name: limpio } });
    revalidatePath("/rental/settings");
  });
}

/**
 * Cambia el correo con el que entra alguien.
 *
 * Las primeras cuentas se crearon con correos que eran solo nombres de usuario
 * (`emma@…`, `alejandra@…`): no hay buzón detrás. Para entrar daba igual, pero
 * «he olvidado mi contraseña» manda un enlace a ese correo, y a un buzón que no
 * existe no llega nada. Esto permite ponerles el suyo de verdad sin crear otra
 * cuenta, que dejaría la vieja colgando con su contraseña de siempre.
 */
export async function cambiarCorreoUsuario(userId: string, correo: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");

    const validado = z.string().email().safeParse(correo.toLowerCase().trim());
    if (!validado.success) throw new ErrorDeNegocio("El correo no es válido.");
    const email = validado.data;

    const usuario = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { email: true },
    });
    if (!usuario) throw new ErrorDeNegocio("Usuario no encontrado");
    if (usuario.email === email) return;

    // La cuenta de administración del arranque se busca por su correo
    // (`ADMIN_EMAIL`). Si se le cambia aquí, el siguiente reinicio no la
    // encuentra y crea otra con la contraseña del entorno: dos cuentas de
    // administración donde había una, y nadie sabe de dónde ha salido.
    const correoDeArranque = (process.env.ADMIN_EMAIL ?? "info@airesmajoreros.pro").toLowerCase().trim();
    if (usuario.email === correoDeArranque) {
      throw new ErrorDeNegocio(
        "Esta es la cuenta de administración que se asegura en cada arranque. Su correo se cambia en la variable ADMIN_EMAIL del hosting, no aquí."
      );
    }

    // Lo mismo con las cuentas que el arranque crea si no las encuentra
    // (`lib/altas-iniciales.ts`): con otro correo dejaría de encontrarlas y
    // las volvería a crear con su contraseña inicial.
    if (ALTAS_INICIALES.some((a) => a.email === usuario.email)) {
      throw new ErrorDeNegocio(
        "Esta cuenta la crea el arranque si no la encuentra con este correo. Para cambiárselo hay que quitarla antes de lib/altas-iniciales.ts."
      );
    }

    const yaExiste = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (yaExiste) throw new ErrorDeNegocio(`Ya hay una cuenta con el correo ${email}.`);

    await prisma.$transaction([
      prisma.user.updateMany({ where: { id: userId, organizationId }, data: { email } }),
      // Un enlace de recuperación pedido antes salió —o iba a salir— hacia el
      // correo anterior.
      prisma.recuperacionDeAcceso.updateMany({
        where: { userId, usadaEl: null },
        data: { usadaEl: new Date() },
      }),
    ]);

    revalidatePath("/rental/settings");
  });
}

export async function cambiarRolUsuario(userId: string, role: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    if (!ROLES_VALIDOS.includes(role)) throw new ErrorDeNegocio("Rol desconocido");

    const session = await getSession();
    if (session?.userId === userId && role !== USER_ROLES.ADMIN) {
      throw new ErrorDeNegocio("No puedes quitarte a ti mismo la administración.");
    }

    await prisma.user.updateMany({ where: { id: userId, organizationId }, data: { role } });
    revalidatePath("/rental/settings");
  });
}

const cambioPropioSchema = z.object({
  actual: z.string().min(1),
  nueva: z.string(),
  repetida: z.string(),
});

/**
 * Cada persona cambia su propia contraseña.
 *
 * No depende de ningún permiso: es de uno mismo. Pide la actual para que una
 * sesión abierta en un ordenador ajeno no sirva para cambiarla.
 */
export async function cambiarMiContrasena(formData: FormData) {
  return conErroresLegibles(async () => {
    const session = await getSession();
    if (!session) throw new ErrorDeNegocio("No autenticado");

    // Sin `parse` a secas: lanza un error que Next esconde en producción, y a
    // quien se equivoca al cambiar la contraseña hay que decirle en qué.
    const leido = cambioPropioSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!leido.success) throw new ErrorDeNegocio("Falta la contraseña actual.");
    const data = leido.data;

    const motivo = motivoContrasenaNoValida(data.nueva, data.repetida);
    if (motivo) throw new ErrorDeNegocio(motivo);

    const usuario = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    if (!usuario) throw new ErrorDeNegocio("Usuario no encontrado");

    if (!(await bcrypt.compare(data.actual, usuario.passwordHash))) {
      throw new ErrorDeNegocio("La contraseña actual no es correcta.");
    }
    if (await bcrypt.compare(data.nueva, usuario.passwordHash)) {
      throw new ErrorDeNegocio("La nueva contraseña es la misma que la actual.");
    }

    // Al ponerse la suya deja de ser de un solo uso: la que le entregaron ya
    // no abre nada, porque su hash se acaba de sustituir.
    const passwordHash = await bcrypt.hash(data.nueva, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      // Y cualquier enlace de recuperación que tuviera pedido deja de valer.
      prisma.recuperacionDeAcceso.updateMany({
        where: { userId: session.userId, usadaEl: null },
        data: { usadaEl: new Date() },
      }),
    ]);

    revalidatePath("/cuenta");
    return { ok: true };
  });
}

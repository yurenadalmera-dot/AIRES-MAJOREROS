"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir, getSession } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";

/** Mínimo razonable para una herramienta interna. */
const MINIMO_CONTRASENA = 10;

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
        role: data.role,
        active: true,
      },
    });

    revalidatePath("/rental/settings");
    return { creada: { email, contrasena } };
  });
}

/** Restablece la contraseña de alguien y devuelve la nueva, una sola vez. */
export async function restablecerContrasena(userId: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");

    const usuario = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { email: true },
    });
    if (!usuario) throw new ErrorDeNegocio("Usuario no encontrado");

    const contrasena = generarContrasena();
    await prisma.user.updateMany({
      where: { id: userId, organizationId },
      data: { passwordHash: await bcrypt.hash(contrasena, 10) },
    });

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
  actual: z.string().min(1, "Falta la contraseña actual"),
  nueva: z.string().min(MINIMO_CONTRASENA, `La nueva debe tener al menos ${MINIMO_CONTRASENA} caracteres`),
  repetida: z.string().min(1),
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

    const data = cambioPropioSchema.parse(Object.fromEntries(formData.entries()));
    if (data.nueva !== data.repetida) {
      throw new ErrorDeNegocio("La nueva contraseña y su repetición no coinciden.");
    }

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

    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await bcrypt.hash(data.nueva, 10) },
    });

    revalidatePath("/cuenta");
    return { ok: true };
  });
}

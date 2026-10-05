import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { huellaDelToken } from "./token-importacion";
import {
  MINUTOS_DE_VALIDEZ_DEL_ENLACE,
  enlaceUtilizable,
  puedePedirOtroEnlace,
  puedeRecuperarPorCorreo,
} from "./acceso";

/**
 * «He olvidado mi contraseña», de punta a punta.
 *
 * Tres pasos, y cada uno lo da alguien distinto:
 *
 *   1. **La persona lo pide** desde la pantalla de entrada (`pedirRecuperacion`).
 *      Queda apuntado y nada más: todavía no existe ningún enlace.
 *   2. **n8n viene a por los pendientes** y manda el correo
 *      (`entregarPendientes`). El enlace se genera en ese momento y se le da a
 *      n8n; aquí solo queda su huella. Mismo reparto que con los informes y el
 *      correo de llegada: el SaaS sabe a quién escribir, pero no tiene por
 *      dónde sacar un correo.
 *   3. **La persona abre el enlace** y se pone una contraseña nueva
 *      (`usuarioDelEnlace`, `restablecerConEnlace`). Vale media hora y una vez.
 *
 * El enlace no se guarda en ningún sitio, ni un minuto: si se generara al
 * pedirlo habría que tenerlo en claro en la base hasta que n8n pasara a
 * recogerlo, y una copia de seguridad hecha en ese rato llevaría dentro llaves
 * que funcionan.
 */

const PREFIJO = "rec_";

/**
 * Una petición que lleva más de esto sin recogerse ya no se envía: quiere decir
 * que n8n estuvo parado, y un correo de «cambia tu contraseña» que llega dos
 * horas después de pedirlo parece un ataque, no una ayuda.
 */
const MINUTOS_EN_COLA = 30;

/**
 * Apunta que alguien ha pedido recuperar el acceso.
 *
 * No devuelve nada a propósito. La pantalla contesta lo mismo exista o no la
 * cuenta: si dijera «ese correo no está», serviría para averiguar quién tiene
 * cuenta aquí probando correos.
 */
export async function pedirRecuperacion(correo: string): Promise<void> {
  const email = correo.toLowerCase().trim();
  const usuario = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true, role: true },
  });
  if (!usuario || !usuario.active) return;
  if (!puedeRecuperarPorCorreo(usuario.role)) return;

  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  const recientes = await prisma.recuperacionDeAcceso.count({
    where: { userId: usuario.id, solicitadaEl: { gte: haceUnaHora } },
  });
  if (!puedePedirOtroEnlace(recientes)) return;

  // La fecha se pone aquí y no se deja al valor por defecto de la columna:
  // todo lo demás compara contra el reloj de la aplicación, y el de MySQL
  // puede ir en otro huso.
  await prisma.recuperacionDeAcceso.create({
    data: { userId: usuario.id, solicitadaEl: new Date() },
  });
}

export interface CorreoDeRecuperacion {
  email: string;
  nombre: string;
  /** Ruta del enlace, sin el dominio: lo pone quien manda el correo. */
  ruta: string;
  caducaEnMinutos: number;
}

/**
 * Los correos de recuperación que hay que mandar ahora.
 *
 * **Cada petición sale una vez.** Al devolverla queda marcada como entregada,
 * así que una segunda llamada no la repite. Si n8n la recoge y luego no
 * consigue enviarla, ese correo se pierde y la persona tiene que volver a
 * pedirlo: es el lado bueno para equivocarse, porque lo contrario sería mandar
 * dos enlaces válidos.
 */
export async function entregarPendientes(organizationId: string): Promise<CorreoDeRecuperacion[]> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - MINUTOS_EN_COLA * 60 * 1000);

  const pendientes = await prisma.recuperacionDeAcceso.findMany({
    where: {
      entregadaEl: null,
      usadaEl: null,
      solicitadaEl: { gte: desde },
      // El rol se vuelve a mirar aquí, no solo al pedirlo: a quien se le
      // haya dado la administración entre medias no se le genera enlace.
      user: { organizationId, active: true, role: { not: "ADMIN" } },
    },
    orderBy: { solicitadaEl: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      solicitadaEl: true,
      user: { select: { name: true, email: true } },
    },
  });

  const correos: CorreoDeRecuperacion[] = [];
  const yaTieneCorreo = new Set<string>();

  for (const p of pendientes) {
    // Quien ha pulsado el botón tres veces seguidas quiere un correo, no tres.
    // Vale la más reciente —vienen ordenadas así—; las otras se cierran.
    if (yaTieneCorreo.has(p.userId)) {
      await prisma.recuperacionDeAcceso.updateMany({
        where: { id: p.id, entregadaEl: null },
        data: { entregadaEl: ahora, usadaEl: ahora },
      });
      continue;
    }

    const token = PREFIJO + randomBytes(32).toString("base64url");
    // Con la condición dentro del `update`: si dos llamadas llegan a la vez,
    // solo una se la lleva y la otra no manda un segundo correo. Y si entre
    // que se leyó y ahora alguien la ha anulado —le han restablecido la
    // contraseña, o le han cambiado el correo—, no sale: sería un enlace
    // muerto.
    const { count } = await prisma.recuperacionDeAcceso.updateMany({
      where: { id: p.id, entregadaEl: null, usadaEl: null },
      data: {
        huella: huellaDelToken(token),
        entregadaEl: ahora,
        caducaEl: new Date(ahora.getTime() + MINUTOS_DE_VALIDEZ_DEL_ENLACE * 60 * 1000),
      },
    });
    if (count !== 1) continue;

    // El último correo es el que vale. Un enlace anterior que siguiera vivo
    // —pidió uno hace diez minutos y ahora pide otro— se cierra: dos llaves
    // válidas a la vez no le sirven a ella y sí a quien encuentre la vieja.
    //
    // Solo las **anteriores** a esta. Cerrando «todas las demás», dos llamadas
    // simultáneas con dos peticiones de la misma persona se llevaban una cada
    // una y cada una cerraba la de la otra: dos correos y ningún enlace bueno.
    await prisma.recuperacionDeAcceso.updateMany({
      where: {
        userId: p.userId,
        usadaEl: null,
        id: { not: p.id },
        solicitadaEl: { lte: p.solicitadaEl },
      },
      data: { usadaEl: ahora },
    });

    yaTieneCorreo.add(p.userId);
    correos.push({
      email: p.user.email,
      nombre: p.user.name,
      ruta: `/restablecer/${token}`,
      caducaEnMinutos: MINUTOS_DE_VALIDEZ_DEL_ENLACE,
    });
  }

  return correos;
}

/** De quién es un enlace, o `null` si no vale, ha caducado o ya se usó. */
export async function usuarioDelEnlace(token: string) {
  if (!token.startsWith(PREFIJO)) return null;

  const peticion = await prisma.recuperacionDeAcceso.findUnique({
    where: { huella: huellaDelToken(token) },
    select: {
      id: true,
      caducaEl: true,
      usadaEl: true,
      user: { select: { id: true, name: true, email: true, active: true, role: true } },
    },
  });
  if (!peticion) return null;
  if (!puedeRecuperarPorCorreo(peticion.user.role)) return null;

  const vale = enlaceUtilizable({
    caducaEl: peticion.caducaEl,
    usadaEl: peticion.usadaEl,
    usuarioActivo: peticion.user.active,
  });
  if (!vale) return null;

  return { peticionId: peticion.id, userId: peticion.user.id, nombre: peticion.user.name };
}

/**
 * Pone la contraseña nueva de quien trae un enlace válido.
 *
 * Devuelve `false` si el enlace no vale. El enlace se gasta **antes** de tocar
 * la contraseña y con la condición dentro del `update`: dos pestañas enviando
 * a la vez no pueden usarlo las dos.
 */
export async function restablecerConEnlace(token: string, nueva: string): Promise<boolean> {
  const dueno = await usuarioDelEnlace(token);
  if (!dueno) return false;

  const passwordHash = await bcrypt.hash(nueva, 10);
  const ahora = new Date();

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.recuperacionDeAcceso.updateMany({
      where: { id: dueno.peticionId, usadaEl: null },
      data: { usadaEl: ahora },
    });
    if (count !== 1) return false;

    // La que se pone es suya y la ha escrito ella: deja de ser de un solo uso
    // aunque la que tuviera antes lo fuera.
    await tx.user.update({
      where: { id: dueno.userId },
      data: { passwordHash, mustChangePassword: false },
    });

    // Los demás enlaces que tuviera pedidos dejan de valer.
    await tx.recuperacionDeAcceso.updateMany({
      where: { userId: dueno.userId, usadaEl: null },
      data: { usadaEl: ahora },
    });

    return true;
  });
}

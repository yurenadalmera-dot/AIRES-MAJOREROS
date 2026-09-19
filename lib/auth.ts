import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { puede, SinPermiso, type Permiso } from "@/lib/permisos";

const COOKIE_NAME = "session";
const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Falta la variable de entorno AUTH_SECRET");
  }
  return encoder.encode(secret);
}

export interface SessionPayload {
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Sesión del usuario actual, o null.
 *
 * No basta con que la cookie tenga una firma válida: la cookie dura 30 días y
 * no se puede retirar desde el servidor. Sin comprobar contra la base de
 * datos, dar de baja a alguien no le quitaba el acceso — podía seguir
 * entrando un mes, aunque un inicio de sesión nuevo ya se le rechazara. Que es
 * lo peor de los dos mundos: parece que le has cortado el acceso y no.
 *
 * Así que se relee el usuario en cada petición. `cache` de React hace que sea
 * una sola consulta por petición aunque la llamen varias páginas.
 *
 * El rol también sale de la base, no de la cookie: cambiarle el rol a alguien
 * surte efecto de inmediato, sin esperar a que caduque su sesión.
 */
export const getSession = cache(async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, organizationId: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) return null;

  return {
    userId: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    role: user.role,
  };
});

/**
 * Exige sesión y permiso, y devuelve la organización sobre la que actuar.
 *
 * Todas las acciones del servidor empiezan por aquí: es el único sitio donde
 * se decide quién puede hacer qué, y devolver el `organizationId` obliga a
 * acotar por él las consultas que vienen después.
 */
export async function exigir(permiso: Permiso): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("No autenticado");
  if (!puede(session.role, permiso)) throw new SinPermiso(permiso);
  return session.organizationId;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

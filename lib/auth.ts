import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { resolveAuthSecret } from "@/lib/demo-mode";

const COOKIE_NAME = "session";
const encoder = new TextEncoder();

export class MissingAuthSecretError extends Error {
  constructor() {
    super(
      "Falta la variable de entorno AUTH_SECRET: sin ella no se pueden firmar las " +
        "cookies de sesión. Defínela en el entorno del servidor con una cadena larga y aleatoria."
    );
    this.name = "MissingAuthSecretError";
  }
}

/** ¿Está el secreto de sesión disponible (configurado o de modo demo)? */
export function hasAuthSecret(): boolean {
  return resolveAuthSecret() !== null;
}

function getSecret() {
  const secret = resolveAuthSecret();
  if (!secret) {
    throw new MissingAuthSecretError();
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

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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

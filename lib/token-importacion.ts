import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * El token con el que n8n puede empujar datos aquí.
 *
 * No va en una variable de entorno porque las de Hostinger solo se pueden
 * **reemplazar todas a la vez** y sus valores no se pueden leer: tocarlas
 * borraría `DATABASE_URL`. Así que se genera desde Ajustes.
 *
 * Se guarda solo su **huella**, no el token. Eso significa que se enseña una
 * vez y nunca más: si se pierde, se genera otro. Es lo correcto para algo que
 * abre una puerta de escritura — de una clave de API ajena guardamos el valor
 * porque hay que reenviarlo, pero de la nuestra no hay ninguna razón.
 */

const PREFIJO = "imp_";

export function generarToken(): string {
  return PREFIJO + randomBytes(24).toString("base64url");
}

export function huellaDelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante: una comparación normal filtra el token. */
export function tokenCoincide(token: string | null | undefined, huellaGuardada: string | null | undefined): boolean {
  if (!token || !huellaGuardada) return false;
  const a = Buffer.from(huellaDelToken(token), "hex");
  const b = Buffer.from(huellaGuardada, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** El token que venga en `Authorization: Bearer …`. */
export function tokenDeLaCabecera(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const m = cabecera.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

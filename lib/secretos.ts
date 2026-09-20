import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Guardar una credencial ajena en la base de datos sin dejarla en claro.
 *
 * La clave de API de Lodgify da acceso a las reservas de la clienta. Guardarla
 * tal cual significa que cualquier volcado de la base —una copia de seguridad,
 * un phpMyAdmin abierto— la entrega. Cifrada, un volcado no basta: hace falta
 * además AUTH_SECRET, que vive en las variables de entorno del hosting.
 *
 * AES-256-GCM: cifra y además autentica, así que un valor manipulado no
 * descifra, falla. La clave sale de AUTH_SECRET por SHA-256 (necesitamos 32
 * bytes exactos y AUTH_SECRET es una cadena de longitud cualquiera).
 *
 * ⚠️ Cambiar AUTH_SECRET deja ilegible lo cifrado con el anterior. No se
 * pierde nada irrecuperable —basta volver a pegar la clave en Ajustes— pero
 * conviene saberlo.
 */

const VERSION = "v1";

function clave(): Buffer {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) throw new Error("No hay AUTH_SECRET: no se puede cifrar ni descifrar.");
  return createHash("sha256").update(secreto).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const etiqueta = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), etiqueta.toString("base64"), cifrado.toString("base64")].join(
    ":"
  );
}

/**
 * Devuelve el texto original, o `null` si no se puede descifrar.
 *
 * Devuelve `null` en vez de reventar a propósito: si algún día cambia
 * AUTH_SECRET, la aplicación tiene que seguir arrancando y decir «no hay clave
 * de Lodgify», no caerse.
 */
export function descifrar(guardado: string | null | undefined): string | null {
  if (!guardado) return null;

  const partes = guardado.split(":");
  if (partes.length !== 4 || partes[0] !== VERSION) return null;

  try {
    const [, iv, etiqueta, cifrado] = partes;
    const decipher = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(etiqueta, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(cifrado, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Para enseñarla sin enseñarla: solo los cuatro últimos caracteres. */
export function enmascarar(texto: string): string {
  const cola = texto.slice(-4);
  return `${"•".repeat(Math.max(texto.length - 4, 4))}${cola}`;
}

/**
 * La llamada al modelo que lee la factura.
 *
 * Vive en el servidor: la clave de la API no puede viajar al cliente. Aquí no
 * se escribe nada en la base — se devuelve lo leído para que una persona lo
 * confirme.
 *
 * Lo que decide la calidad no está en este archivo: está en `prompt.ts` (qué
 * se le pide) y en `validacion.ts` (qué se comprueba después). Esto solo pone
 * el documento delante del modelo y recoge lo que conteste.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ESQUEMA_FACTURA } from "./esquema";
import { INSTRUCCIONES, PROMPT_VERSION } from "./prompt";

/** Extraer es transcribir, no razonar. */
const MODELO = process.env.MODELO_EXTRACCION || "claude-opus-5";

/**
 * `effort` no existe en toda la familia: los modelos antiguos devuelven 400
 * si se les manda, **antes** de leer el documento. Como el modelo se puede
 * cambiar por variable de entorno para comparar, mandarlo a ciegas
 * convertiría «probar otro modelo» en «romper la lectura».
 */
const ACEPTA_EFFORT = new Set([
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
  "claude-fable-5-1",
]);

const PDF = "application/pdf";
const IMAGENES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_BYTES = 10 * 1024 * 1024;

export { MODELO, PROMPT_VERSION };

export const admitido = (mime: string): boolean => mime === PDF || IMAGENES.includes(mime);

/**
 * Por qué no se puede leer, dicho para quien está delante de la pantalla.
 *
 * El archivo se guarda igual: perder el justificante por un formato es un
 * fallo caro y evitable.
 */
export function motivoNoAdmitido(mime: string): string {
  if (/^image\/hei[cf]$/i.test(mime)) {
    return (
      "Las fotos en formato HEIC del iPhone todavía no se pueden leer. El archivo se guarda " +
      "igual: rellena los datos a mano, o vuelve a hacer la foto poniendo el formato «Más " +
      "compatible» en los ajustes de la cámara."
    );
  }
  return "De este tipo de archivo no sabemos leer los datos. Rellénalos a mano.";
}

/** Un error cuyo mensaje se le puede enseñar a quien está delante. */
export class ErrorDeLectura extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeLectura";
  }
}

export interface UsoDeLaLectura {
  modelo: string;
  promptVersion: string;
  tokensEntrada: number;
  tokensSalida: number;
  /** Si esto sale 0 llamada tras llamada, hay algo que invalida el prefijo. */
  tokensCache: number;
}

export interface Conocido {
  id: string;
  nombre: string;
}

/**
 * Lee una factura. Devuelve lo que ha dicho el modelo **sin tocar**: quien lo
 * verifica es `revisarFactura`, y la respuesta literal se guarda tal cual
 * porque es la única forma de medir después si el modelo acierta.
 */
export async function leerFactura({
  bytes,
  mime,
  apiKey,
  proveedores = [],
  viviendas = [],
}: {
  bytes: Buffer;
  mime: string;
  apiKey: string;
  proveedores?: Conocido[];
  viviendas?: Conocido[];
}): Promise<{ datos: unknown; uso: UsoDeLaLectura }> {
  if (!bytes?.length) throw new ErrorDeLectura("El archivo está vacío.");
  if (bytes.length > MAX_BYTES) {
    throw new ErrorDeLectura(
      `El archivo pesa ${(bytes.length / 1048576).toFixed(1)} MB y el máximo para leerlo ` +
        "automáticamente son 10 MB. Se ha guardado igual: rellena los datos a mano."
    );
  }
  if (!admitido(mime)) throw new ErrorDeLectura(motivoNoAdmitido(mime));

  const cliente = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  const b64 = bytes.toString("base64");

  // El adjunto va ANTES del texto: el modelo tiene el documento presente al
  // leer la instrucción.
  const adjunto =
    mime === PDF
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 } }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mime as "image/jpeg", data: b64 },
        };

  // Las listas van ordenadas de forma determinista: un orden que cambie entre
  // llamadas rompe el prefijo de la caché sin que se note.
  const lista = (xs: Conocido[]) =>
    [...xs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => `${c.id}\t${c.nombre}`)
      .join("\n");

  const contexto = [
    proveedores.length > 0
      ? `Proveedores ya conocidos (id\\tnombre). Si el emisor es claramente uno de estos, ` +
        `devuelve su id en proveedor_id; si no lo es o dudas, deja null:\n${lista(proveedores)}`
      : "",
    viviendas.length > 0
      ? `Viviendas de la gestora (id\\tnombre). Si la factura identifica una sin lugar a ` +
        `dudas, devuelve su id en vivienda_id; si no, deja null:\n${lista(viviendas)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let respuesta;
  try {
    respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 4096,
      // Lo estable primero y con punto de caché al final: nada de fechas ni
      // identificadores por petición aquí dentro.
      system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
      output_config: {
        // Garantía, no petición: «devuélveme JSON» en el prompt más un
        // JSON.parse no es salida estructurada, es una esperanza.
        format: { type: "json_schema", schema: ESQUEMA_FACTURA as unknown as Record<string, unknown> },
        ...(ACEPTA_EFFORT.has(MODELO) ? { effort: "low" as const } : {}),
      },
      messages: [
        {
          role: "user",
          content: [
            adjunto,
            {
              type: "text",
              text: contexto
                ? `${contexto}\n\nExtrae los datos de este documento.`
                : "Extrae los datos de este documento.",
            },
          ],
        },
      ],
    });
  } catch (error) {
    // Los tres fallos que suelen acabar en el mismo mensaje inútil, separados:
    // mandar a alguien a buscar donde no es es peor que no decir nada.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ErrorDeLectura(
        "La clave de lectura de facturas no vale. Revísala en Ajustes; mientras tanto, " +
          "rellena los datos a mano."
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ErrorDeLectura(
        "Se han hecho demasiadas lecturas seguidas. Prueba dentro de un minuto."
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new ErrorDeLectura(
        `No se ha podido leer el documento (error ${error.status}). El archivo se ha guardado: ` +
          "rellena los datos a mano."
      );
    }
    throw new ErrorDeLectura(
      "No se ha podido contactar con el servicio de lectura. El archivo se ha guardado: " +
        "rellena los datos a mano."
    );
  }

  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    // El esquema estricto lo hace improbable, pero el día que pase no debe
    // tumbar el flujo: el archivo ya está guardado.
    throw new ErrorDeLectura(
      "No hemos podido interpretar el documento. Rellena los datos a mano."
    );
  }

  const u = respuesta.usage;
  return {
    datos,
    uso: {
      modelo: MODELO,
      promptVersion: PROMPT_VERSION,
      tokensEntrada: u?.input_tokens ?? 0,
      tokensSalida: u?.output_tokens ?? 0,
      tokensCache: u?.cache_read_input_tokens ?? 0,
    },
  };
}

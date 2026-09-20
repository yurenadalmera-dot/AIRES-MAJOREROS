/**
 * El esquema de lo que se le pide al modelo al leer una factura de gasto.
 *
 * Un campo del esquema = una columna de lo que se guarda. Sin capa de
 * traducción en medio: es justo ahí donde se pierden los `null` y donde nadie
 * se acuerda de actualizar los dos lados al añadir un campo.
 *
 * **Lo contraintuitivo, y lo más importante de este archivo:** un campo que
 * puede faltar va en `required` *y* admite `null`. Si fuera obligatorio sin
 * `null`, el modelo perdería la opción de decir «no lo encuentro» y tendría
 * que escribir algo: un «N/A», un 0, o el NIF que apareciera en el pie de
 * página. Con `null` permitido, el hueco es una respuesta válida.
 */

export const ESQUEMA_FACTURA = {
  type: "object",
  additionalProperties: false,
  required: [
    "fecha",
    "num_documento",
    "proveedor_literal",
    "proveedor_id",
    "nif_proveedor",
    "concepto",
    "base",
    "impuesto_pct",
    "impuesto",
    "total",
    "vivienda_id",
    "confianza",
    "avisos",
  ],
  properties: {
    fecha: {
      type: ["string", "null"],
      description: "Fecha de emisión de la factura, en formato AAAA-MM-DD.",
    },
    num_documento: {
      type: ["string", "null"],
      description: "Número de la factura, tal cual figura impreso.",
    },
    // Transcripción y resolución, separadas: así nunca se pierde lo que
    // decía el papel y «proveedor nuevo» sigue siendo una salida válida.
    proveedor_literal: {
      type: "string",
      description: "Nombre del proveedor TAL CUAL aparece impreso, sin corregirlo ni abreviarlo.",
    },
    proveedor_id: {
      type: ["string", "null"],
      description:
        "Id del catálogo si el proveedor es claramente uno de los de la lista. null si no lo es, si no estás seguro, o si no te han pasado lista.",
    },
    nif_proveedor: {
      type: ["string", "null"],
      description: "NIF o CIF de quien emite la factura. null si no se lee con seguridad.",
    },
    concepto: {
      type: "string",
      description:
        "Qué se ha pagado, en pocas palabras y en español: «Luz de agosto», «Reparación de la lavadora», «Comunidad, 3er trimestre».",
    },
    base: {
      type: ["number", "null"],
      description: "Base imponible, sin impuestos. TAL CUAL figure impresa: NO la calcules.",
    },
    impuesto_pct: {
      type: ["string", "null"],
      description:
        'Tipo de impuesto tal cual figura: "7%", "3%", "0%", "exento". En Canarias lo normal es IGIC al 7 %. Si la factura lleva IVA en vez de IGIC, ponlo igual y dilo en un aviso.',
    },
    impuesto: {
      type: ["number", "null"],
      description: "Cuota de IGIC o IVA. TAL CUAL figure impresa: NO la calcules.",
    },
    total: {
      type: ["number", "null"],
      description: "Total a pagar, TAL CUAL figure en el pie de la factura. NO lo calcules.",
    },
    vivienda_id: {
      type: ["string", "null"],
      description:
        "Id de la vivienda si la factura la identifica sin lugar a dudas (dirección, punto de suministro, referencia). null si no lo dice o si dudas.",
    },
    confianza: {
      type: "string",
      enum: ["alta", "media", "baja"],
      description:
        "Cómo de seguro estás de lo leído, mirando el estado del papel: borroso, torcido, cortado, cifras dudosas.",
    },
    avisos: {
      type: "array",
      items: { type: "string" },
      description:
        "Lo que la persona debe mirar con atención, en frases cortas. Vacío si no hay nada que avisar.",
    },
  },
} as const;

/**
 * Los campos sin los que una factura de gasto no sirve. Alimentan el marcado
 * ámbar de la pantalla de revisión: lo que la máquina intentó y no encontró.
 *
 * `impuesto` no está: hay facturas exentas y proveedores que no lo desglosan,
 * y un aviso que salta siempre se acaba ignorando.
 */
export const IMPRESCINDIBLES = ["fecha", "proveedor_literal", "concepto", "total"] as const;

/**
 * Importes donde un 0 es casi siempre una lectura fallida, con el nombre que
 * se usa al reclamarlos. Ver `validacion.ts`.
 *
 * `impuesto` va aparte porque su cero sí puede ser real: lo decide el tipo
 * impreso, no esta lista.
 */
export const CERO_SOSPECHOSO: [string, string][] = [
  ["base", "la base imponible"],
  ["total", "el total de la factura"],
];

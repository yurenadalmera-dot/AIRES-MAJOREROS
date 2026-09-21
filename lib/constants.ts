// Valores "enum" centralizados (SQLite no soporta enums nativos en Prisma,
// así que se validan aquí en la capa de aplicación). Mantenerlos aquí evita
// strings mágicos repartidos por el código.

export const BUSINESS_TYPES = {
  RENTAL_MANAGEMENT: "RENTAL_MANAGEMENT",
  CLEANING_BILLING: "CLEANING_BILLING",
} as const;
export type BusinessType = (typeof BUSINESS_TYPES)[keyof typeof BUSINESS_TYPES];

export const BOOKING_STATUS = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const;

export const BOOKING_SOURCE = {
  MANUAL: "MANUAL",
  LODGIFY: "LODGIFY",
} as const;

// Lista de canales de venta habitual en alquiler vacacional. Es editable por
// el usuario en el formulario (campo libre con sugerencias), no una
// restricción rígida, para no atar la app a un cliente concreto.
export const SUGGESTED_CHANNELS = [
  "Airbnb",
  "Booking.com",
  "Lodgify",
  "VRBO / Expedia",
  "Directo",
  "Otro",
];

export const TASK_TYPE = {
  CLEANING: "CLEANING",
  MAINTENANCE: "MAINTENANCE",
} as const;

export const TASK_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  DONE: "Hecha",
  CANCELLED: "Cancelada",
};

export const EMPLOYEE_ROLE = {
  CLEANING: "CLEANING",
  MAINTENANCE: "MAINTENANCE",
  BOTH: "BOTH",
} as const;

export const EMPLOYEE_ROLE_LABEL: Record<string, string> = {
  CLEANING: "Limpieza",
  MAINTENANCE: "Mantenimiento",
  BOTH: "Limpieza y mantenimiento",
};

export const PROPERTY_STATUS = {
  OCCUPIED: "OCCUPIED",
  AVAILABLE: "AVAILABLE",
  CLEANING_NEEDED: "CLEANING_NEEDED",
  MAINTENANCE: "MAINTENANCE",
} as const;
export type PropertyStatus = (typeof PROPERTY_STATUS)[keyof typeof PROPERTY_STATUS];

export const PROPERTY_STATUS_LABEL: Record<string, string> = {
  OCCUPIED: "Ocupada",
  AVAILABLE: "Libre",
  CLEANING_NEEDED: "Limpieza pendiente",
  MAINTENANCE: "En mantenimiento",
};

/** Tono de la etiqueta de estado (ver `.badge-*` en `app/globals.css`). */
export const PROPERTY_STATUS_COLOR: Record<string, string> = {
  OCCUPIED: "badge-info",
  AVAILABLE: "badge-bien",
  CLEANING_NEEDED: "badge-aviso",
  MAINTENANCE: "badge-mal",
};

/**
 * Qué significa exactamente cada estado, con las palabras del cálculo que lo
 * produce (`lib/status.ts`). Se enseña en la leyenda del panel y como título
 * de la etiqueta.
 *
 * Importa sobre todo la diferencia entre «Libre» y «lista para entrar»: el
 * sistema solo marca «Limpieza pendiente» cuando hoy hay una salida y la
 * limpieza de hoy no está hecha. Una vivienda que se quedó sucia de ayer
 * aparece como «Libre», así que libre no quiere decir lista.
 */
export const PROPERTY_STATUS_HINT: Record<string, string> = {
  OCCUPIED: "Hay una reserva confirmada en curso hoy.",
  AVAILABLE:
    "Hoy no hay reserva en curso ni salida pendiente de limpiar. No confirma que la vivienda esté lista: eso lo dice el tablero de limpiezas.",
  CLEANING_NEEDED: "Hoy hay una salida y la limpieza de hoy todavía no está marcada como hecha.",
  MAINTENANCE: "Hay un mantenimiento en curso o con la fecha ya cumplida.",
};

export const INVOICE_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  PAID: "PAID",
} as const;

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  PAID: "Cobrada",
};

/**
 * Cambios de estado permitidos en una factura.
 *
 * Una factura emitida **no vuelve a borrador**. Emitir es un acto con efectos
 * fiscales: lo que está mal en una factura emitida se corrige con una factura
 * rectificativa, no deshaciendo la original. La normativa de sistemas
 * informáticos de facturación (VeriFactu) lo exige de forma explícita, pero la
 * regla es más vieja que VeriFactu.
 *
 * Cobrada ↔ Emitida sí se permite: marcar si se ha cobrado o no es un dato
 * comercial, no altera la factura.
 */
export const INVOICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["DRAFT", "ISSUED"],
  ISSUED: ["ISSUED", "PAID"],
  PAID: ["PAID", "ISSUED"],
};

export function puedeCambiarEstadoFactura(desde: string, hasta: string): boolean {
  return (INVOICE_STATUS_TRANSITIONS[desde] ?? []).includes(hasta);
}

export const USER_ROLES = {
  ADMIN: "ADMIN",
  RENTAL_MANAGER: "RENTAL_MANAGER",
  PARTNER: "PARTNER",
  STAFF: "STAFF",
} as const;

export const USER_ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administración",
  RENTAL_MANAGER: "Gestión de alquileres",
  PARTNER: "Socia",
  STAFF: "Empleada",
};

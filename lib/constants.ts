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

export const PROPERTY_STATUS_COLOR: Record<string, string> = {
  OCCUPIED: "bg-blue-100 text-blue-800 border-blue-200",
  AVAILABLE: "bg-green-100 text-green-800 border-green-200",
  CLEANING_NEEDED: "bg-amber-100 text-amber-800 border-amber-200",
  MAINTENANCE: "bg-rose-100 text-rose-800 border-rose-200",
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

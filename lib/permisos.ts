import { ErrorDeNegocio } from "@/lib/errores";

// Quién puede hacer qué.
//
// Hasta ahora `role` solo se usaba para pintar una etiqueta en la barra
// lateral: cualquiera que entrase podía hacer de todo, incluido borrar
// reservas, cambiar los datos fiscales o tocar el reparto entre socias.
//
// ⚠️ El reparto de abajo es una propuesta conservadora, no una regla del
// negocio confirmada. Se ha hecho pegándose a lo que significa cada rol en
// el seed. Si no encaja con cómo trabajáis, se cambia aquí y en ningún sitio
// más — es la única tabla que decide.
//
//   ADMIN          administración: puede todo.
//   RENTAL_MANAGER la gestora del alquiler (Emma): operativa de viviendas,
//                  reservas, limpiezas y personal, **y los datos de los
//                  propietarios** —NIF, domicilio, correo, qué documento
//                  reciben—, porque es quien habla con ellos. No toca la
//                  facturación, ni el reparto entre socias, ni las cuentas.
//   PARTNER        las socias de la empresa de limpiezas: facturación y
//                  operativa de limpiezas. No toca las reservas ni ve la
//                  operativa de alquiler.
//   STAFF          quien limpia: solo avanzar el estado de su trabajo.

export type Permiso =
  | "operativa.alquiler" // reservas, viviendas, propietarios, sync de Lodgify
  | "operativa.limpiezas" // asignar limpiezas, crear mantenimientos, borrarlas
  | "operativa.estado_tarea" // marcar una limpieza como hecha
  | "facturacion" // emitir facturas y cambiar su estado
  | "administracion"; // datos fiscales, reparto entre socias, personal

const PERMISOS_POR_ROL: Record<string, Permiso[]> = {
  ADMIN: [
    "operativa.alquiler",
    "operativa.limpiezas",
    "operativa.estado_tarea",
    "facturacion",
    "administracion",
  ],
  RENTAL_MANAGER: ["operativa.alquiler", "operativa.limpiezas", "operativa.estado_tarea"],
  PARTNER: ["operativa.limpiezas", "operativa.estado_tarea", "facturacion"],
  STAFF: ["operativa.estado_tarea"],
};

export function puede(rol: string, permiso: Permiso): boolean {
  return (PERMISOS_POR_ROL[rol] ?? []).includes(permiso);
}

/** Mensaje de error único, para que la interfaz lo muestre igual en todas partes. */
export class SinPermiso extends ErrorDeNegocio {
  constructor(permiso: Permiso) {
    super(`No tienes permiso para esta acción (${permiso}).`);
    this.name = "SinPermiso";
  }
}

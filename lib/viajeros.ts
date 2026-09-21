/**
 * El parte de viajeros: reglas que no tocan la base de datos.
 *
 * Quien da alojamiento tiene que registrar e informar los datos de cada
 * viajero (Real Decreto 933/2021, a través de SES.HOSPEDAJES). Aquí vive lo
 * que se puede comprobar sin salir del proceso: qué falta, qué está mal
 * escrito y quién es menor.
 *
 * Lo que **no** está aquí es el formato del envío a la plataforma. La
 * especificación del servicio web se baja de SES.HOSPEDAJES con certificado y
 * todavía no la tenemos; inventarse el formato sería tirar el trabajo. Lo que
 * sí se puede hacer sin ella —recoger los datos bien y saber a quién le
 * faltan— es todo lo demás, y es esto.
 */

import { nifValido, normalizarNif } from "./ocr/nif";

/** Con menos de esta edad, los datos los da el adulto que acompaña. */
export const EDAD_MAYORIA = 18;

export const TIPOS_DE_DOCUMENTO = {
  NIF: "DNI o NIF",
  NIE: "NIE",
  PAS: "Pasaporte",
  OTRO: "Otro documento",
} as const;

export type TipoDeDocumento = keyof typeof TIPOS_DE_DOCUMENTO;

export const SEXOS = { F: "Mujer", M: "Hombre", O: "Otro" } as const;

export interface DatosDeViajero {
  nombre: string;
  apellido1: string;
  apellido2?: string | null;
  tipoDocumento: string;
  documento: string;
  numeroSoporte?: string | null;
  nacionalidad: string;
  fechaNacimiento: Date;
  sexo?: string | null;
  direccion?: string | null;
  municipio?: string | null;
  provincia?: string | null;
  pais?: string | null;
  codigoPostal?: string | null;
  telefono?: string | null;
  email?: string | null;
  parentesco?: string | null;
}

/** Los años que tiene alguien en una fecha dada. */
export function edadEn(nacimiento: Date, cuando: Date): number {
  let edad = cuando.getUTCFullYear() - nacimiento.getUTCFullYear();
  const mes = cuando.getUTCMonth() - nacimiento.getUTCMonth();
  if (mes < 0 || (mes === 0 && cuando.getUTCDate() < nacimiento.getUTCDate())) edad--;
  return edad;
}

export function esMenor(nacimiento: Date, cuando: Date = new Date()): boolean {
  return edadEn(nacimiento, cuando) < EDAD_MAYORIA;
}

/**
 * Qué le falta o qué está mal a los datos de un viajero.
 *
 * Devuelve la lista de problemas, en castellano y dirigida a quien rellena el
 * formulario. Vacía significa que está completo.
 *
 * `cuando` es la fecha de entrada: la mayoría de edad se mira ahí, no hoy,
 * porque lo que importa es cómo viaja.
 */
export function problemasDelViajero(v: Partial<DatosDeViajero>, cuando: Date = new Date()): string[] {
  const fallos: string[] = [];

  if (!v.nombre?.trim()) fallos.push("Falta el nombre.");
  if (!v.apellido1?.trim()) fallos.push("Falta el primer apellido.");
  if (!v.tipoDocumento) fallos.push("Falta el tipo de documento.");
  if (!v.documento?.trim()) fallos.push("Falta el número del documento.");
  if (!v.nacionalidad?.trim()) fallos.push("Falta la nacionalidad.");
  if (!v.fechaNacimiento) fallos.push("Falta la fecha de nacimiento.");

  // Un DNI o un NIE mal copiado se caza aquí, mientras la persona lo tiene
  // delante. Descubrirlo al comunicar el parte, días después, obliga a
  // perseguir al huésped cuando ya se ha ido.
  if (v.documento && (v.tipoDocumento === "NIF" || v.tipoDocumento === "NIE")) {
    if (!nifValido(v.documento)) {
      fallos.push(
        `El documento «${normalizarNif(v.documento)}» no cuadra: revisa que no se haya colado una letra por un número.`
      );
    }
  }

  // El número de soporte solo existe en el DNI y el NIE españoles. No es el
  // número del documento: va impreso al lado y cambia cada vez que se renueva.
  if ((v.tipoDocumento === "NIF" || v.tipoDocumento === "NIE") && !v.numeroSoporte?.trim()) {
    fallos.push("Falta el número de soporte, el que va impreso junto al número del documento.");
  }

  if (v.fechaNacimiento) {
    if (v.fechaNacimiento > cuando) {
      fallos.push("La fecha de nacimiento es posterior a la entrada.");
    } else if (edadEn(v.fechaNacimiento, cuando) > 120) {
      fallos.push("Revisa la fecha de nacimiento: salen más de 120 años.");
    } else if (esMenor(v.fechaNacimiento, cuando) && !v.parentesco?.trim()) {
      // Con un menor hay que decir quién responde por él.
      fallos.push("Es menor de edad: falta el parentesco con el adulto que le acompaña.");
    }
  }

  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) {
    fallos.push("El correo no parece un correo.");
  }

  return fallos;
}

/** Estado del parte de una reserva, para poder ordenarlo por urgencia. */
export type EstadoDelParte = "COMUNICADO" | "COMPLETO" | "INCOMPLETO" | "SIN_DATOS";

export const ESTADO_DEL_PARTE_LABEL: Record<EstadoDelParte, string> = {
  COMUNICADO: "Comunicado",
  COMPLETO: "Listo para comunicar",
  INCOMPLETO: "Le faltan datos",
  SIN_DATOS: "Sin datos",
};

export const ESTADO_DEL_PARTE_TONO: Record<EstadoDelParte, string> = {
  COMUNICADO: "badge-bien",
  COMPLETO: "badge-info",
  INCOMPLETO: "badge-aviso",
  SIN_DATOS: "badge-mal",
};

/**
 * En qué punto está el parte de una reserva.
 *
 * `huespedesEsperados` son los que dice la reserva (adultos + niños): si han
 * rellenado menos, falta gente por registrar.
 */
export function estadoDelParte({
  comunicadoEl,
  viajeros,
  huespedesEsperados,
  entrada,
}: {
  comunicadoEl: Date | null;
  viajeros: Partial<DatosDeViajero>[];
  huespedesEsperados: number;
  entrada: Date;
}): EstadoDelParte {
  if (comunicadoEl) return "COMUNICADO";
  if (viajeros.length === 0) return "SIN_DATOS";
  if (viajeros.length < huespedesEsperados) return "INCOMPLETO";
  const hayFallos = viajeros.some((v) => problemasDelViajero(v, entrada).length > 0);
  return hayFallos ? "INCOMPLETO" : "COMPLETO";
}

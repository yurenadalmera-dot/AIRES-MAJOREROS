/**
 * Lo que hay que contarle al huésped antes de que llegue.
 *
 * Hoy esto lo contesta una persona por WhatsApp, cada vez, y muchas veces de
 * noche o en el aeropuerto. Siempre es lo mismo: cómo se llega, a qué hora se
 * puede entrar, cuál es el wifi. Guardarlo por vivienda y mandarlo solo unos
 * días antes es la diferencia entre atender y repetirse.
 *
 * **El código de la caja de llaves no va aquí.** Está en la vivienda, cifrado,
 * pero esto no lo devuelve nunca: un correo se queda para siempre en el buzón
 * de mucha gente y el código no cambia entre un huésped y el siguiente. Se
 * manda aparte, el día de la entrada y por un canal que caduque.
 */

import { differenceInCalendarDays, startOfDay } from "date-fns";
import { prisma } from "./prisma";

/** Qué le falta a una vivienda para poder escribirle al huésped. */
export interface QueFalta {
  campo: string;
  etiqueta: string;
}

const IMPRESCINDIBLES: { campo: keyof DatosDeLlegada["vivienda"]; etiqueta: string }[] = [
  { campo: "direccion", etiqueta: "la dirección" },
  { campo: "comoLlegar", etiqueta: "cómo se llega" },
  { campo: "horaEntrada", etiqueta: "la hora de entrada" },
];

export interface DatosDeLlegada {
  bookingId: string;
  huesped: string;
  entrada: Date;
  salida: Date;
  /** Días desde hoy hasta la entrada. 0 es hoy, negativo es que ya entró. */
  diasHastaLaEntrada: number;
  vivienda: {
    nombre: string;
    direccion: string | null;
    comoLlegar: string | null;
    mapaUrl: string | null;
    horaEntrada: string | null;
    horaSalida: string | null;
    wifiRed: string | null;
    wifiClave: string | null;
    normas: string | null;
  };
  /** Vacío cuando la vivienda tiene todo lo que hace falta. */
  falta: QueFalta[];
  /** Si tiene código de llave guardado. **Nunca el código.** */
  tieneCodigoDeLlave: boolean;
}

/**
 * Las entradas de los próximos `dias` días, con lo que hay que contarles.
 *
 * Devuelve también las que están incompletas, y dice qué les falta: una lista
 * que solo enseña lo que ya está listo esconde justo el trabajo pendiente.
 */
export async function llegadasProximas({
  organizationId,
  dias = 7,
  desde = new Date(),
}: {
  organizationId: string;
  dias?: number;
  desde?: Date;
}): Promise<DatosDeLlegada[]> {
  const hoy = startOfDay(desde);
  const hasta = new Date(hoy.getTime() + dias * 86400000);
  hasta.setHours(23, 59, 59, 999);

  const reservas = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      checkIn: { gte: hoy, lte: hasta },
    },
    include: { property: true },
    orderBy: { checkIn: "asc" },
  });

  return reservas.map((r) => {
    const v = {
      nombre: r.property.name,
      direccion: r.property.address,
      comoLlegar: r.property.comoLlegar,
      mapaUrl: r.property.mapaUrl,
      horaEntrada: r.property.horaEntrada,
      horaSalida: r.property.horaSalida,
      wifiRed: r.property.wifiRed,
      wifiClave: r.property.wifiClave,
      normas: r.property.normas,
    };
    const falta = IMPRESCINDIBLES.filter((i) => !v[i.campo]).map((i) => ({
      campo: String(i.campo),
      etiqueta: i.etiqueta,
    }));

    return {
      bookingId: r.id,
      huesped: r.guestName,
      entrada: r.checkIn,
      salida: r.checkOut,
      diasHastaLaEntrada: differenceInCalendarDays(startOfDay(r.checkIn), hoy),
      vivienda: v,
      falta,
      tieneCodigoDeLlave: Boolean(r.property.codigoLlaveCifrado),
    };
  });
}

/** ¿Está esta vivienda lista para escribirle a quien llega? */
export function listaParaEscribir(d: DatosDeLlegada): boolean {
  return d.falta.length === 0;
}

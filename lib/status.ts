import { isSameDay, startOfDay } from "date-fns";
import { PROPERTY_STATUS } from "@/lib/constants";

interface BookingLike {
  status: string;
  checkIn: Date;
  checkOut: Date;
}

interface TaskLike {
  type: string;
  status: string;
  date: Date;
}

/**
 * Estado calculado de una vivienda a partir de sus reservas y tareas, para no
 * tener que mantenerlo sincronizado a mano. `manualStatus` permite forzarlo
 * puntualmente (p.ej. vivienda cerrada por obras) y siempre gana.
 */
export function computePropertyStatus(
  manualStatus: string | null | undefined,
  bookings: BookingLike[],
  tasks: TaskLike[],
  referenceDate: Date = new Date()
): string {
  if (manualStatus) return manualStatus;

  const today = startOfDay(referenceDate);
  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");

  const occupiedNow = confirmed.some(
    (b) => startOfDay(b.checkIn) <= today && today < startOfDay(b.checkOut)
  );
  if (occupiedNow) return PROPERTY_STATUS.OCCUPIED;

  const checkoutToday = confirmed.some((b) => isSameDay(b.checkOut, today));
  if (checkoutToday) {
    const cleaningDoneToday = tasks.some(
      (t) => t.type === "CLEANING" && isSameDay(t.date, today) && t.status === "DONE"
    );
    if (!cleaningDoneToday) return PROPERTY_STATUS.CLEANING_NEEDED;
  }

  // Un mantenimiento cuenta si ya ha empezado o si le ha llegado la fecha.
  // Sin la comprobación de fecha, programar una revisión para dentro de medio
  // año dejaba la vivienda marcada «en mantenimiento» desde hoy, y con ella
  // los contadores de libres y ocupadas del panel del día.
  const openMaintenance = tasks.some(
    (t) =>
      t.type === "MAINTENANCE" &&
      (t.status === "IN_PROGRESS" ||
        (t.status === "PENDING" && startOfDay(t.date) <= today))
  );
  if (openMaintenance) return PROPERTY_STATUS.MAINTENANCE;

  return PROPERTY_STATUS.AVAILABLE;
}

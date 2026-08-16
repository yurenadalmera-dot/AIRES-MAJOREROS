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

  const openMaintenance = tasks.some(
    (t) => t.type === "MAINTENANCE" && (t.status === "PENDING" || t.status === "IN_PROGRESS")
  );
  if (openMaintenance) return PROPERTY_STATUS.MAINTENANCE;

  return PROPERTY_STATUS.AVAILABLE;
}

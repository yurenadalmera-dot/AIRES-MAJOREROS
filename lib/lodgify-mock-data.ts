// Datos ficticios que simulan la respuesta paginada de la API de Lodgify
// (GET /v2/reservations/bookings). Se usan cuando no hay LODGIFY_API_KEY
// configurada, para poder probar el flujo de sincronización de principio a
// fin sin credenciales reales. La forma de los objetos imita los campos
// relevantes de la API real: id, status, property_id, fechas, huésped,
// ocupantes, importe total y canal de venta.
//
// Incluye a propósito:
//  - reservas "Booked" nuevas (para probar la creación)
//  - reservas "Booked" que coinciden con IDs ya existentes en el seed (para
//    probar el upsert idempotente, incluida una marcada manuallyAdjusted que
//    el sync debe respetar y NO tocar)
//  - reservas "Declined" y "Tentative" (para probar el filtrado)
//  - un property_id que no existe en el sistema (para probar el manejo de
//    viviendas sin emparejar)

export interface LodgifyReservationRaw {
  id: string;
  status: "Booked" | "Declined" | "Tentative" | "Cancelled";
  property_id: string;
  guest_name: string;
  arrival: string; // ISO date
  departure: string; // ISO date
  adults: number;
  children: number;
  total_amount: number;
  source: string; // canal de venta
}

const PAGE_SIZE = 10;

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const ALL_RESERVATIONS: LodgifyReservationRaw[] = [
  // --- Coinciden con reservas ya sembradas: deben actualizarse (o
  //     saltarse si están bloqueadas por ajuste manual) sin duplicarse ---
  { id: "lodgify-bk-2001", status: "Booked", property_id: "lodgify-1001", guest_name: "Laura Fernández", arrival: daysFromNow(-2), departure: daysFromNow(3), adults: 4, children: 0, total_amount: 780, source: "Airbnb" },
  { id: "lodgify-bk-2002", status: "Booked", property_id: "lodgify-1003", guest_name: "Thomas Weber", arrival: daysFromNow(-1), departure: daysFromNow(4), adults: 2, children: 1, total_amount: 620, source: "Booking.com" },
  { id: "lodgify-bk-2011", status: "Booked", property_id: "lodgify-1005", guest_name: "Sven Andersen", arrival: daysFromNow(3), departure: daysFromNow(6), adults: 2, children: 0, total_amount: 9999, source: "Booking.com" }, // el sync NO debe tocar esta (manuallyAdjusted=true en el seed)

  // --- Nuevas reservas confirmadas: deben crearse ---
  { id: "lodgify-bk-3001", status: "Booked", property_id: "lodgify-1002", guest_name: "Hannah Becker", arrival: daysFromNow(9), departure: daysFromNow(13), adults: 2, children: 0, total_amount: 480, source: "Airbnb" },
  { id: "lodgify-bk-3002", status: "Booked", property_id: "lodgify-1004", guest_name: "Fabio Bianchi", arrival: daysFromNow(11), departure: daysFromNow(14), adults: 2, children: 0, total_amount: 315, source: "Lodgify" },
  { id: "lodgify-bk-3003", status: "Booked", property_id: "lodgify-1006", guest_name: "Els Peeters", arrival: daysFromNow(12), departure: daysFromNow(16), adults: 1, children: 0, total_amount: 260, source: "VRBO / Expedia" },
  { id: "lodgify-bk-3004", status: "Booked", property_id: "lodgify-1007", guest_name: "Ricardo Nunes", arrival: daysFromNow(16), departure: daysFromNow(23), adults: 5, children: 2, total_amount: 1720, source: "Booking.com" },

  // --- Deben descartarse: no están confirmadas ---
  { id: "lodgify-bk-3005", status: "Declined", property_id: "lodgify-1001", guest_name: "Chris Taylor", arrival: daysFromNow(18), departure: daysFromNow(21), adults: 2, children: 0, total_amount: 390, source: "Airbnb" },
  { id: "lodgify-bk-3006", status: "Tentative", property_id: "lodgify-1003", guest_name: "Nina Petrova", arrival: daysFromNow(20), departure: daysFromNow(24), adults: 2, children: 0, total_amount: 410, source: "Booking.com" },
  { id: "lodgify-bk-3007", status: "Cancelled", property_id: "lodgify-1002", guest_name: "Omar Haddad", arrival: daysFromNow(19), departure: daysFromNow(22), adults: 3, children: 0, total_amount: 340, source: "Directo" },

  // --- Vivienda no emparejada en el sistema (property_id desconocido) ---
  { id: "lodgify-bk-3008", status: "Booked", property_id: "lodgify-9999", guest_name: "Unmatched Guest", arrival: daysFromNow(25), departure: daysFromNow(28), adults: 2, children: 0, total_amount: 300, source: "Airbnb" },
];

/** Simula GET /v2/reservations/bookings?page=N, paginando de PAGE_SIZE en PAGE_SIZE. */
export async function fetchMockLodgifyPage(page: number): Promise<{
  items: LodgifyReservationRaw[];
  hasMore: boolean;
}> {
  const start = (page - 1) * PAGE_SIZE;
  const items = ALL_RESERVATIONS.slice(start, start + PAGE_SIZE);
  return { items, hasMore: start + PAGE_SIZE < ALL_RESERVATIONS.length };
}

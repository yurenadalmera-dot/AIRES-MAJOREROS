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
  /** Lodgify no siempre lo trae; sin él no se le puede escribir a quien llega. */
  guest_email?: string;
  guest_phone?: string;
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

  // --- Historial: reservas que ya terminaron hace meses ---
  //
  // Sin esto, los datos de ejemplo solo cubrían esta semana, y el caso de
  // «subir todo el año» no se podía probar: las limpiezas de una reserva
  // terminada en marzo no deben aparecer como pendientes.
  { id: "lodgify-bk-1901", status: "Booked", property_id: "lodgify-1001", guest_name: "Klaus Berger", arrival: daysFromNow(-300), departure: daysFromNow(-293), adults: 4, children: 0, total_amount: 910, source: "Booking.com" },
  { id: "lodgify-bk-1902", status: "Booked", property_id: "lodgify-1002", guest_name: "Sophie Dubois", arrival: daysFromNow(-210), departure: daysFromNow(-203), adults: 2, children: 2, total_amount: 640, source: "Airbnb" },
  { id: "lodgify-bk-1903", status: "Booked", property_id: "lodgify-1003", guest_name: "Marco Rossi", arrival: daysFromNow(-150), departure: daysFromNow(-143), adults: 6, children: 0, total_amount: 1120, source: "Directo" },
  { id: "lodgify-bk-1904", status: "Booked", property_id: "lodgify-1001", guest_name: "Anne Jansen", arrival: daysFromNow(-90), departure: daysFromNow(-83), adults: 3, children: 1, total_amount: 875, source: "Airbnb" },
  { id: "lodgify-bk-1905", status: "Booked", property_id: "lodgify-1005", guest_name: "Paul Smith", arrival: daysFromNow(-40), departure: daysFromNow(-33), adults: 2, children: 0, total_amount: 520, source: "Booking.com" },

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

// --- Viviendas -------------------------------------------------------------
//
// El equivalente de GET /v2/properties. Los identificadores coinciden con los
// property_id de las reservas de arriba, incluido `lodgify-9999`, que no está
// sembrado: así el modo de demostración también sirve para probar que la
// sincronización da de alta una vivienda que no existía.

export interface LodgifyPropertyRaw {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  max_people: number;
  bedrooms: number;
  bathrooms: number;
  active: boolean;
}

const ALL_PROPERTIES: LodgifyPropertyRaw[] = [
  { id: "lodgify-1001", name: "Villa Duna Corralejo", city: "Corralejo", address: "C/ Las Dunas 12", max_people: 8, bedrooms: 4, bathrooms: 3, active: true },
  { id: "lodgify-1002", name: "Apartamento Faro El Cotillo", city: "El Cotillo", address: "C/ del Faro 3", max_people: 4, bedrooms: 2, bathrooms: 1, active: true },
  { id: "lodgify-1003", name: "Bungalow Costa Calma Sur", city: "Costa Calma", address: "Av. del Sur 45", max_people: 6, bedrooms: 3, bathrooms: 2, active: true },
  { id: "lodgify-1004", name: "Ático Caleta de Fuste Golf", city: "Caleta de Fuste", address: "Urb. Golf 8", max_people: 4, bedrooms: 2, bathrooms: 2, active: true },
  { id: "lodgify-1005", name: "Casa Rural Villaverde", city: "Villaverde", address: "Camino Real 2", max_people: 6, bedrooms: 3, bathrooms: 2, active: true },
  { id: "lodgify-1006", name: "Loft Puerto del Rosario Centro", city: "Puerto del Rosario", address: "C/ Primero de Mayo 30", max_people: 2, bedrooms: 1, bathrooms: 1, active: true },
  { id: "lodgify-1007", name: "Villa Jandía Playa", city: "Morro Jable", address: "Av. Jandía 101", max_people: 10, bedrooms: 5, bathrooms: 4, active: true },
  { id: "lodgify-9999", name: "Vivienda nueva en Lodgify", city: "Lajares", address: null, max_people: 4, bedrooms: 2, bathrooms: 1, active: true },
];

/** Simula GET /v2/properties?page=N. */
export async function fetchMockLodgifyPropertiesPage(page: number): Promise<{
  items: LodgifyPropertyRaw[];
  hasMore: boolean;
}> {
  const start = (page - 1) * PAGE_SIZE;
  const items = ALL_PROPERTIES.slice(start, start + PAGE_SIZE);
  return { items, hasMore: start + PAGE_SIZE < ALL_PROPERTIES.length };
}

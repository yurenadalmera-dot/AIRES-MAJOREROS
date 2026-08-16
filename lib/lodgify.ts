import { fetchMockLodgifyPage, type LodgifyReservationRaw } from "@/lib/lodgify-mock-data";

export interface NormalizedReservation {
  externalId: string;
  status: string;
  propertyExternalId: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  totalPrice: number;
  channel: string;
}

const LODGIFY_API_BASE = "https://api.lodgify.com/v2";

/** true si hay una clave real configurada; si no, se usa el modo demo. */
export function isLodgifyLiveMode(): boolean {
  return !!process.env.LODGIFY_API_KEY;
}

async function fetchLivePage(apiKey: string, page: number) {
  const res = await fetch(`${LODGIFY_API_BASE}/reservations/bookings?page=${page}&size=50`, {
    headers: { "X-ApiKey": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Lodgify respondió ${res.status} al pedir la página ${page}`);
  }
  const json = await res.json();
  // La forma exacta de la respuesta puede variar según la versión de API;
  // se normaliza de forma defensiva.
  const items: LodgifyReservationRaw[] = (json.items ?? json.data ?? json ?? []).map(
    (r: Record<string, unknown>) => ({
      id: String(r.id ?? r.reservation_id),
      status: String(r.status ?? "Booked") as LodgifyReservationRaw["status"],
      property_id: String(r.property_id ?? r.propertyId ?? ""),
      guest_name: String(r.guest_name ?? r.guestName ?? "Huésped"),
      arrival: String(r.arrival ?? r.checkIn ?? r.date_arrival),
      departure: String(r.departure ?? r.checkOut ?? r.date_departure),
      adults: Number(r.adults ?? r.people ?? 1),
      children: Number(r.children ?? 0),
      total_amount: Number(r.total_amount ?? r.totalAmount ?? 0),
      source: String(r.source ?? r.channel_name ?? "Lodgify"),
    })
  );
  const hasMore = Boolean(json.has_more ?? json.hasMore ?? items.length >= 50);
  return { items, hasMore };
}

/**
 * Recorre todas las páginas de reservas de Lodgify (real o demo) y devuelve
 * la lista completa ya normalizada, incluyendo las no confirmadas (el
 * filtrado de status se hace en el llamador para que quede explícito y
 * auditable en el log de sincronización).
 */
export async function fetchAllLodgifyReservations(): Promise<NormalizedReservation[]> {
  const apiKey = process.env.LODGIFY_API_KEY;
  const results: LodgifyReservationRaw[] = [];

  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { items, hasMore: more } = apiKey
      ? await fetchLivePage(apiKey, page)
      : await fetchMockLodgifyPage(page);
    results.push(...items);
    hasMore = more;
    page++;
    if (page > 50) break; // salvaguarda anti-bucle infinito
  }

  return results.map((r) => ({
    externalId: r.id,
    status: r.status,
    propertyExternalId: r.property_id,
    guestName: r.guest_name,
    checkIn: new Date(r.arrival),
    checkOut: new Date(r.departure),
    adults: r.adults,
    children: r.children,
    totalPrice: r.total_amount,
    channel: r.source,
  }));
}

/** Solo las reservas confirmadas: descarta Declined/Cancelled/Tentative/etc. */
export function onlyConfirmed(reservations: NormalizedReservation[]): NormalizedReservation[] {
  return reservations.filter((r) => r.status === "Booked");
}

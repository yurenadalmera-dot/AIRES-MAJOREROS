import {
  fetchMockLodgifyPage,
  fetchMockLodgifyPropertiesPage,
  type LodgifyReservationRaw,
  type LodgifyPropertyRaw,
} from "@/lib/lodgify-mock-data";
import { prisma } from "@/lib/prisma";
import { descifrar } from "@/lib/secretos";
import { ErrorDeNegocio } from "@/lib/errores";

export interface NormalizedReservation {
  externalId: string;
  status: string;
  propertyExternalId: string;
  guestName: string;
  /**
   * El correo del huésped, si Lodgify lo da. `null` cuando no viene.
   *
   * Sin esto no se le puede escribir a quien llega, que es la mitad de la
   * atención al huésped. Lodgify no siempre lo trae en el listado —y en las
   * reservas de Booking.com suele ser una dirección de alias del canal—, así
   * que se busca en los nombres con los que puede venir y, si no aparece, se
   * deja vacío para rellenarlo a mano en la ficha de la reserva.
   */
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  totalPrice: number;
  channel: string;
}

const LODGIFY_API_BASE = "https://api.lodgify.com/v2";

/**
 * Un texto de verdad, o `null`.
 *
 * Lodgify manda cadenas vacías donde no hay dato. Guardarlas como `""` hace
 * que un correo que falta parezca un correo puesto, y la pantalla no lo marca
 * como pendiente.
 */
function textoONada(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const limpio = v.trim();
  return limpio === "" ? undefined : limpio;
}

/**
 * Lo que dice Lodgify cuando dice que no, en algo que se pueda leer.
 *
 * Que Lodgify rechace la clave es un fallo **previsible**, no un error
 * interno: quien lo tiene que arreglar es quien está mirando la pantalla. Si
 * se lanza como error normal, Next lo sustituye en producción por «An error
 * occurred in the Server Components render…» y no queda más rastro que los
 * registros del servidor — donde no mira nadie.
 */
function fallodeLodgify(status: number, que: string): ErrorDeNegocio {
  if (status === 401 || status === 403) {
    return new ErrorDeNegocio(
      `Lodgify rechaza la clave de API (${status}) al pedir ${que}. ` +
        "Comprueba en Ajustes → Integración con Lodgify que la clave es la correcta y está entera, " +
        "y en Lodgify que sigue activa y que la cuenta tiene acceso a la API."
    );
  }
  if (status === 429) {
    return new ErrorDeNegocio(
      `Lodgify está limitando las peticiones (429) al pedir ${que}. Espera unos minutos y vuelve a sincronizar.`
    );
  }
  return new ErrorDeNegocio(`Lodgify respondió ${status} al pedir ${que}.`);
}

/**
 * La clave de API de Lodgify, si la hay.
 *
 * Primero la que esté guardada en Ajustes (cifrada en la base de datos) y, si
 * no hay, la variable de entorno del hosting. Ese orden importa: cambiar la
 * clave desde la aplicación no debería exigir tocar el hosting ni recompilar.
 */
export async function claveLodgify(organizationId: string): Promise<string | null> {
  const ajustes = await prisma.integrationSettings.findUnique({
    where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    select: { apiKeyCifrada: true },
  });
  return descifrar(ajustes?.apiKeyCifrada) ?? process.env.LODGIFY_API_KEY ?? null;
}

/** ¿Se está trabajando contra Lodgify de verdad, o con datos inventados? */
export async function isLodgifyLiveMode(organizationId: string): Promise<boolean> {
  return (await claveLodgify(organizationId)) !== null;
}

async function fetchLivePage(apiKey: string, page: number) {
  const res = await fetch(`${LODGIFY_API_BASE}/reservations/bookings?page=${page}&size=50`, {
    headers: { "X-ApiKey": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw fallodeLodgify(res.status, `las reservas (página ${page})`);
  const json = await res.json();
  // La forma exacta de la respuesta puede variar según la versión de API;
  // se normaliza de forma defensiva.
  const items: LodgifyReservationRaw[] = (json.items ?? json.data ?? json ?? []).map(
    (r: Record<string, unknown>) => ({
      id: String(r.id ?? r.reservation_id),
      status: String(r.status ?? "Booked") as LodgifyReservationRaw["status"],
      property_id: String(r.property_id ?? r.propertyId ?? ""),
      // El nombre puede venir suelto o dentro de `guest`. Las 29 entradas de
      // los próximos treinta días llegaban como «Huésped», que es el valor de
      // reserva de aquí abajo: se estaba mirando en un solo sitio.
      guest_name: String(
        r.guest_name ??
          r.guestName ??
          (r.guest as Record<string, unknown> | undefined)?.name ??
          "Huésped"
      ),
      guest_email: textoONada(
        r.guest_email ?? r.guestEmail ?? (r.guest as Record<string, unknown> | undefined)?.email
      ),
      guest_phone: textoONada(
        r.guest_phone ?? r.guestPhone ?? (r.guest as Record<string, unknown> | undefined)?.phone
      ),
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
export async function fetchAllLodgifyReservations(
  apiKey: string | null
): Promise<NormalizedReservation[]> {
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
    guestEmail: r.guest_email ?? null,
    guestPhone: r.guest_phone ?? null,
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

// --- Viviendas -------------------------------------------------------------

export interface NormalizedProperty {
  externalId: string;
  name: string;
  locality: string;
  address: string | null;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  active: boolean;
}

async function fetchLivePropertiesPage(apiKey: string, page: number) {
  const res = await fetch(`${LODGIFY_API_BASE}/properties?page=${page}&size=50`, {
    headers: { "X-ApiKey": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw fallodeLodgify(res.status, `las viviendas (página ${page})`);
  const json = await res.json();
  // Igual que con las reservas: la forma exacta varía según la versión de la
  // API, así que se lee de forma defensiva y se acepta cualquiera de los
  // nombres conocidos para cada campo.
  const items: LodgifyPropertyRaw[] = (json.items ?? json.data ?? json ?? []).map(
    (p: Record<string, unknown>) => ({
      id: String(p.id ?? p.property_id ?? p.propertyId),
      name: String(p.name ?? p.title ?? "Vivienda sin nombre"),
      city: (p.city ?? p.town ?? null) as string | null,
      address: (p.address ?? p.address_1 ?? p.street ?? null) as string | null,
      max_people: Number(p.max_people ?? p.maxPeople ?? p.capacity ?? 0),
      bedrooms: Number(p.bedrooms ?? p.rooms ?? 0),
      bathrooms: Number(p.bathrooms ?? 0),
      active: p.is_active === undefined && p.active === undefined ? true : Boolean(p.is_active ?? p.active),
    })
  );
  const hasMore = Boolean(json.has_more ?? json.hasMore ?? items.length >= 50);
  return { items, hasMore };
}

/** Todas las viviendas de la cuenta de Lodgify (reales o de demostración). */
export async function fetchAllLodgifyProperties(
  apiKey: string | null
): Promise<NormalizedProperty[]> {
  const results: LodgifyPropertyRaw[] = [];

  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { items, hasMore: more } = apiKey
      ? await fetchLivePropertiesPage(apiKey, page)
      : await fetchMockLodgifyPropertiesPage(page);
    results.push(...items);
    hasMore = more;
    page++;
    if (page > 50) break; // salvaguarda anti-bucle infinito
  }

  return results.map((p) => ({
    externalId: p.id,
    name: p.name,
    // La localidad es obligatoria en nuestra ficha y en Lodgify puede venir
    // vacía. Mejor un texto que se ve y se corrige que dejar la vivienda sin
    // dar de alta.
    locality: p.city?.trim() || "(sin localidad)",
    address: p.address?.trim() || null,
    capacity: p.max_people > 0 ? p.max_people : 2,
    bedrooms: p.bedrooms > 0 ? p.bedrooms : 1,
    bathrooms: p.bathrooms > 0 ? p.bathrooms : 1,
    active: p.active,
  }));
}

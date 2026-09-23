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
/** Un número de verdad, o `null`. `NaN` y las cadenas vacías no lo son. */
function numeroONada(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Un número que además tiene que ser positivo: plazas, dormitorios, baños.
 *
 * Esto **no** vale para las coordenadas. La longitud de Fuerteventura es
 * −14,23, así que exigir «mayor que cero» se cargaba el mapa de las once
 * viviendas en silencio. Medio planeta tiene la longitud negativa y el
 * hemisferio sur entero, la latitud.
 */
function cuantosONada(v: unknown): number | null {
  const n = numeroONada(v);
  return n !== null && n > 0 ? n : null;
}

/** Calle, código postal y ciudad en una línea, sin decir dos veces lo mismo. */
function juntarDireccion(
  calle: string | null | undefined,
  zip: string | null | undefined,
  ciudad: string | null | undefined
): string | null {
  const todas = [calle?.trim(), zip?.trim(), ciudad?.trim()].filter(
    (p): p is string => Boolean(p)
  );
  // Se queda cada parte que no esté ya dicha dentro de otra. Comparado sin
  // acentos ni mayúsculas, que es como se repite de verdad.
  //
  // Hacerlo al final y no sobre la marcha importa: con Villa Mónica, «35627»
  // entraba antes de que llegara la ciudad —que lo lleva dentro— y se quedaba
  // colgando al final de la dirección.
  const partes = todas.filter(
    (parte, i) =>
      !todas.some(
        (otra, j) => j !== i && normalizar(otra).includes(normalizar(parte)) &&
          // Entre dos partes idénticas se queda la primera, no ninguna.
          (normalizar(otra) !== normalizar(parte) || j < i)
      )
  );
  return partes.join(", ") || null;
}

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
  /**
   * Plazas, dormitorios y baños, **o `null` si Lodgify no los da**.
   *
   * No los da por esta API: ni `max_people`, ni `bedrooms`, ni `bathrooms`
   * aparecen en `/properties` ni en el detalle de una propiedad —comprobado
   * contra la cuenta real el 22/09—. Antes esto no era `null` sino 2, 1 y 1,
   * porque el mapeo los daba por ausentes y ponía un valor de reserva. El
   * resultado es que todas las viviendas figuraban con una habitación y un
   * baño, y ese número acabó saliendo en el tablero de limpiezas como si
   * fuera cierto.
   *
   * `null` significa «no lo sé», y quien lo lea decide: al crear la vivienda
   * se usan los valores por defecto de la ficha, y al refrescarla no se toca
   * lo que ya hubiera puesto una persona.
   */
  capacity: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** La descripción del anuncio, tal cual viene (HTML). */
  descripcion: string | null;
  /** Coordenadas exactas, para el enlace al mapa. */
  latitud: number | null;
  longitud: number | null;
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
      zip: (p.zip ?? p.postal_code ?? null) as string | null,
      description: (p.description ?? null) as string | null,
      latitude: numeroONada(p.latitude),
      longitude: numeroONada(p.longitude),
      // Ojo con `rooms`: en la respuesta real es un **array** de habitaciones
      // con su id y su nombre, no un número. `Number([{…}])` da NaN, y NaN no
      // es mayor que cero, así que caía al valor de reserva y todas las
      // viviendas acababan con un dormitorio.
      max_people: cuantosONada(p.max_people ?? p.maxPeople ?? p.capacity),
      bedrooms: cuantosONada(p.bedrooms),
      bathrooms: cuantosONada(p.bathrooms),
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
    // La dirección, entera. Lodgify la reparte en calle, código postal y
    // ciudad, y al huésped hay que darle las tres — pero sin repetirlas: en
    // Villa Mónica la «ciudad» ya trae la carretera y el código postal
    // dentro, y pegarlas sin mirar daba «FV-617, 35627, FV-617, Barranco del
    // Tarajal de Sancho, Pájara, 35627».
    address: juntarDireccion(p.address, p.zip, p.city),
    capacity: p.max_people ?? null,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    descripcion: p.description?.trim() || null,
    latitud: p.latitude ?? null,
    longitud: p.longitude ?? null,
    active: p.active,
  }));
}

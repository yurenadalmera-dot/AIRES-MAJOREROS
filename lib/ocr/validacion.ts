/**
 * Lo que el código comprueba después de que hable el modelo.
 *
 * El reparto de papeles: **el modelo transcribe, el código verifica, la
 * persona confirma.** Tres papeles que no se mezclan. Nada de esto se delega
 * al prompt: un prompt es una petición, una validación es una garantía, y
 * hacen falta las dos.
 *
 * Cuando una comprobación falla se avisa y se baja la confianza — **no se
 * arregla el número**. Un dato corregido en silencio por una heurística es
 * otra vez el problema que se intenta evitar.
 *
 * ## El orden de los bloques es causal, no estético
 *
 *     1. Regla del cero   → convierte ceros sospechosos en huecos
 *     2. Cuadres          → rellena huecos desde lo que sí está impreso
 *     3. Avisos           → reclama solo lo que sigue faltando
 *
 * Puestos al revés se anulan entre sí sin dar ningún error: `hay(0)` es
 * `true`, así que un cero colocado después de un cuadre entra en él como dato
 * bueno e impide la deducción que lo habría recuperado. Hay una prueba de
 * simetría (0 y null dan lo mismo) que falla si alguien reordena esto.
 */

import { round2, leerImporte } from "../money";
import { nifValido } from "./nif";
import { CERO_SOSPECHOSO, IMPRESCINDIBLES } from "./esquema";

export type Confianza = "alta" | "media" | "baja";

export interface DatosFactura {
  fecha: string | null;
  num_documento: string | null;
  proveedor_literal: string;
  proveedor_id: string | null;
  nif_proveedor: string | null;
  concepto: string;
  base: number | null;
  impuesto_pct: string | null;
  impuesto: number | null;
  total: number | null;
  vivienda_id: string | null;
}

export interface FacturaRevisada {
  datos: DatosFactura;
  confianza: Confianza;
  /** La que calcula el código, de 0 a 1. Es la que ordena la bandeja. */
  fiabilidad: number;
  /** Por qué bajó. Sin esto, un 0,55 obliga a abrir el documento. */
  motivos: string[];
  /** Los del modelo y los del código, juntos: dicen cosas distintas. */
  avisos: string[];
  /** Campos que rellenó la máquina — se marcan en azul para repasarlos. */
  rellenadosPorIa: string[];
  /** Imprescindibles que la máquina no encontró — se marcan en ámbar. */
  faltantes: string[];
}

export interface ContextoDeRevision {
  /** Ids de proveedores conocidos, para comprobar que no se inventa uno. */
  proveedores?: string[];
  /** Ids de viviendas de la organización. */
  viviendas?: string[];
  /** Para juzgar si la fecha es plausible. Por defecto, hoy. */
  hoy?: Date;
}

const ORDEN: Record<Confianza, number> = { alta: 3, media: 2, baja: 1 };

const hay = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Un cero de impuesto es real solo si hay un tipo impreso que lo respalde. */
const tipoJustificaElCero = (pct: string | null): boolean =>
  !!pct && /^\s*(0([.,]0+)?\s*%?|exento|exenta)\s*$/i.test(pct);

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Pasa la respuesta del modelo por el molde, sin fiarse de nada.
 *
 * El esquema estricto hace improbable que llegue otra cosa, pero el día que
 * pase no debe tumbar el flujo: el archivo ya está guardado y lo que toca es
 * que la persona rellene a mano.
 */
function moldear(bruto: unknown): DatosFactura {
  const r = (bruto ?? {}) as Record<string, unknown>;
  return {
    fecha: texto(r.fecha),
    num_documento: texto(r.num_documento),
    proveedor_literal: texto(r.proveedor_literal) ?? "",
    proveedor_id: texto(r.proveedor_id),
    nif_proveedor: texto(r.nif_proveedor),
    concepto: texto(r.concepto) ?? "",
    base: leerImporte(r.base),
    impuesto_pct: texto(r.impuesto_pct),
    impuesto: leerImporte(r.impuesto),
    total: leerImporte(r.total),
    vivienda_id: texto(r.vivienda_id),
  };
}

/** ¿Es una fecha que existe de verdad, y plausible para una factura? */
function fechaPlausible(iso: string, hoy: Date): { ok: boolean; motivo?: string } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ok: false, motivo: "la fecha no tiene el formato esperado" };

  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  // Caza los 31 de febrero: el Date los habría corrido al mes siguiente.
  if (d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1) {
    return { ok: false, motivo: "esa fecha no existe" };
  }
  // Un año mal leído manda la factura al trimestre equivocado, en silencio.
  const manana = new Date(hoy.getTime() + 24 * 3600 * 1000);
  if (d > manana) return { ok: false, motivo: "la fecha es futura" };
  if (anio < 2000) return { ok: false, motivo: "la fecha es demasiado antigua" };
  return { ok: true };
}

/**
 * Revisa lo que ha devuelto el modelo. Función pura: recibe la respuesta y el
 * contexto, y no toca ni la base ni la red. Es lo que permite probarla.
 */
export function revisarFactura(
  bruto: unknown,
  contexto: ContextoDeRevision = {}
): FacturaRevisada {
  const datos = moldear(bruto);
  const proveedores = new Set(contexto.proveedores ?? []);
  const viviendas = new Set(contexto.viviendas ?? []);
  const hoy = contexto.hoy ?? new Date();

  const avisos: string[] = [];
  const motivos: string[] = [];
  let confianza: Confianza = (() => {
    const c = (bruto as { confianza?: unknown })?.confianza;
    return c === "alta" || c === "media" || c === "baja" ? c : "media";
  })();

  // La confianza solo puede empeorar. Si se asignase directa en varios
  // sitios ganaría la última, que puede ser la más benévola, y un documento
  // con un problema detectado subiría en una bandeja ordenada por fiabilidad.
  const bajar = (nivel: Confianza) => {
    if (ORDEN[nivel] < ORDEN[confianza]) confianza = nivel;
  };
  const avisar = (t: string) => {
    if (!avisos.includes(t)) avisos.push(t);
  };

  const delModelo = (bruto as { avisos?: unknown })?.avisos;
  if (Array.isArray(delModelo)) {
    for (const a of delModelo) if (typeof a === "string" && a.trim()) avisar(a.trim());
  }

  // ── 1. La regla del cero ────────────────────────────────────────────
  // Solo convierte y anota. Avisar aquí sería decir «no hemos encontrado el
  // total» justo encima de «lo hemos deducido de la base»: dos avisos que se
  // contradicen enseñan a no leer los avisos.
  const eranCero = new Map<string, string>();
  for (const [campo, nombre] of CERO_SOSPECHOSO) {
    if ((datos as unknown as Record<string, unknown>)[campo] === 0) {
      (datos as unknown as Record<string, number | null>)[campo] = null;
      eranCero.set(campo, nombre);
      bajar("media");
    }
  }
  // El impuesto es el caso con matiz: un cero es real cuando otro campo del
  // documento lo respalda.
  if (datos.impuesto === 0 && !tipoJustificaElCero(datos.impuesto_pct)) {
    datos.impuesto = null;
    eranCero.set("impuesto", "la cuota de impuesto");
    bajar("media");
  }

  // ── 2. Cuadres por contraste ────────────────────────────────────────
  // Restar dos cifras impresas es más fiable que confiar en una suma que el
  // modelo no hizo. Esto solo vale porque el prompt pidió números impresos y
  // prohibió calcularlos: si el modelo los dedujera, cuadrarían siempre.
  const recuperados = new Set<string>();
  const deducir = (campo: "base" | "impuesto" | "total", valor: number, como: string) => {
    datos[campo] = round2(valor);
    recuperados.add(campo);
    avisar(`${como} Compruébalo con el papel.`);
    bajar("media");
  };

  if (hay(datos.base) && hay(datos.total) && !hay(datos.impuesto)) {
    deducir("impuesto", datos.total - datos.base, "La cuota se ha deducido del total menos la base.");
  } else if (hay(datos.base) && hay(datos.impuesto) && !hay(datos.total)) {
    deducir("total", datos.base + datos.impuesto, "El total se ha deducido de la base más la cuota.");
  } else if (hay(datos.impuesto) && hay(datos.total) && !hay(datos.base)) {
    deducir("base", datos.total - datos.impuesto, "La base se ha deducido del total menos la cuota.");
  } else if (
    hay(datos.base) &&
    hay(datos.impuesto) &&
    hay(datos.total) &&
    // 0,02 absorbe el redondeo legítimo de una factura con varias líneas.
    Math.abs(datos.base + datos.impuesto - datos.total) > 0.02
  ) {
    // Están los tres y no cuadran: uno se ha leído mal y no se sabe cuál.
    // No se corrige ninguno; avisar es lo único honesto.
    avisar(
      `Los números no cuadran: base ${datos.base} más impuesto ${datos.impuesto} no da el total ` +
        `${datos.total} que figura. Revisa los tres antes de guardar.`
    );
    motivos.push("el total no cuadra");
    bajar("baja");
  }

  // ── 3. Los avisos, al final: solo lo que sigue faltando ─────────────
  for (const [campo, nombre] of eranCero) {
    if (!hay((datos as unknown as Record<string, unknown>)[campo])) {
      avisar(`No hemos encontrado ${nombre}. Complétalo mirando el original.`);
    }
  }

  // ── Ids del catálogo ────────────────────────────────────────────────
  // Un id alucinado es menos frecuente que un dato alucinado y mucho más
  // difícil de ver en una bandeja: un id parece siempre correcto.
  if (datos.proveedor_id && !proveedores.has(datos.proveedor_id)) {
    datos.proveedor_id = null;
    avisar("El proveedor no se ha podido emparejar con ninguno conocido. Elígelo a mano.");
    motivos.push("proveedor sin asignar");
    bajar("baja");
  }
  if (datos.vivienda_id && !viviendas.has(datos.vivienda_id)) {
    datos.vivienda_id = null;
    avisar("La vivienda que se ha leído no existe. Elígela a mano.");
    motivos.push("vivienda sin asignar");
    bajar("baja");
  }

  // ── Identificadores y fechas ────────────────────────────────────────
  // El valor leído se conserva aunque no valide: quien revisa necesita ver
  // qué puso la máquina para compararlo con el papel.
  if (datos.nif_proveedor && !nifValido(datos.nif_proveedor)) {
    avisar(`El NIF «${datos.nif_proveedor}» no es correcto. Puede estar mal leído.`);
    motivos.push("el NIF no valida");
    bajar("media");
  }
  if (datos.fecha) {
    const { ok, motivo } = fechaPlausible(datos.fecha, hoy);
    if (!ok) {
      avisar(`La fecha «${datos.fecha}» no parece buena: ${motivo}. Míralo en el original.`);
      motivos.push("la fecha no es plausible");
      bajar("baja");
    }
  }

  // ── Fiabilidad ──────────────────────────────────────────────────────
  // La señal del modelo es una entrada más, no la decisión: no es un
  // estimador calibrado, pero ve cosas que el código no puede derivar (papel
  // borroso, dos totales impresos, una firma tachada).
  let score = { alta: 1, media: 0.7, baja: 0.4 }[confianza];
  const faltantes: string[] = [];
  for (const campo of IMPRESCINDIBLES) {
    const v = (datos as unknown as Record<string, unknown>)[campo];
    if (v === null || v === "") faltantes.push(campo);
  }
  if (faltantes.length > 0) {
    score -= 0.15 * faltantes.length;
    motivos.push(
      faltantes.length === 1
        ? "falta un campo imprescindible"
        : `faltan ${faltantes.length} campos imprescindibles`
    );
  }
  if (!datos.num_documento) score -= 0.05;

  // Lo que rellenó la máquina, para el marcado azul. Un null nunca cuenta:
  // no se ha rellenado nada.
  const rellenadosPorIa = Object.entries(datos)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k]) => k);

  return {
    datos,
    confianza,
    fiabilidad: Math.max(0, round2(score)),
    motivos,
    avisos,
    rellenadosPorIa,
    faltantes,
  };
}

/**
 * Pasa lo leído al formulario sin pisar lo que ya haya escrito una persona.
 *
 * Dos reglas: un `null` del modelo nunca borra nada, y lo que ya tiene valor
 * se respeta. Si alguien empezó a rellenar a mano mientras la lectura iba por
 * detrás, su trabajo gana.
 */
export function volcar<T extends Record<string, unknown>>(
  formulario: T,
  leidos: Partial<Record<keyof T, unknown>>
): { formulario: T; rellenados: string[] } {
  const salida = { ...formulario };
  const rellenados: string[] = [];
  for (const [campo, valor] of Object.entries(leidos)) {
    if (valor === null || valor === undefined || valor === "") continue;
    const actual = (salida as Record<string, unknown>)[campo];
    if (actual !== undefined && actual !== null && actual !== "") continue;
    (salida as Record<string, unknown>)[campo] = valor;
    rellenados.push(campo);
  }
  return { formulario: salida, rellenados };
}

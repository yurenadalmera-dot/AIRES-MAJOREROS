/**
 * Traerse los datos de Mirador.
 *
 * Mirador (n8n + Supabase) tiene la cartera real y los movimientos del banco;
 * aquí no había nada. Esto recibe un volcado suyo y lo mete, **sin duplicar
 * nada**, para poder repetir la importación tantas veces como haga falta
 * hasta que cuadre.
 *
 * La parte de decidir qué hacer con cada fila vive aquí, separada de la que
 * toca la base de datos, porque es donde están las decisiones que conviene
 * poder probar: qué se considera el mismo propietario, qué apunte ya estaba,
 * y qué se rechaza antes de escribir.
 *
 * Las reservas **no** se importan: Lodgify es su origen y la aplicación ya
 * sabe traerlas sola. De Mirador hacen falta dos cosas para que entren bien:
 * el emparejamiento de cada vivienda con su identificador de Lodgify, y las
 * **comisiones por canal** —sin ellas, cada reserva que entra lo hace con un
 * porcentaje por defecto que no es el vuestro—.
 */

import { leerImporte } from "./money";
import { COMISIONES_CONTRASTADAS, normalizarCanal } from "./comisiones-canal";

export type TipoDeMovimiento = "gasto" | "sueldo" | "traspaso" | "ingreso";
export type Reparto = "directo" | "compartido";

const TIPOS: TipoDeMovimiento[] = ["gasto", "sueldo", "traspaso", "ingreso"];
const REPARTOS: Reparto[] = ["directo", "compartido"];

export type Servicio = "salida" | "repaso";
const SERVICIOS: Servicio[] = ["salida", "repaso"];

export interface PropietarioEntrante {
  ref: string;
  /** La tarifa de limpieza que se le aplica. */
  tarifaRef?: string | null;
  nombre: string;
  cif?: string | null;
  direccion?: string | null;
  email?: string | null;
  /** Cuota fija mensual de gestión, si la paga. */
  cuotaFija?: number | null;
}

export interface GrupoEntrante {
  ref: string;
  propietarioRef: string;
  nombre: string;
  /** Solo cuando la comisión es un porcentaje. */
  managementPct?: number | null;
}

export interface ViviendaEntrante {
  ref: string;
  propietarioRef?: string | null;
  grupoRef?: string | null;
  nombre: string;
  plazas?: number | null;
  lodgifyId?: string | null;
  activa?: boolean;
}

export interface MovimientoEntrante {
  /** La huella del apunte en Mirador. Es lo que impide importarlo dos veces. */
  origenHash: string;
  tipo?: string;
  /** `null` es válido: hay apuntes que llegaron sin fecha. */
  fecha?: string | null;
  concepto: string;
  importe: number | string;
  proveedor?: string | null;
  reparto?: string;
  revisar?: string | null;
  viviendaRef?: string | null;
  grupoRef?: string | null;
  propietarioRef?: string | null;
}

export interface TarifaEntrante {
  ref: string;
  nombre: string;
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
  lineas?: {
    servicio: string;
    base: number | string;
    huespedesIncluidos?: number | null;
    porHuespedAdicional?: number | string | null;
  }[];
}

export interface PrecioCerradoEntrante {
  viviendaRef: string;
  servicio: string;
  precio: number | string;
}

export interface ComisionEntrante {
  /** Tal como lo manda Lodgify: `BookingCom`, `AirbnbIntegration`, `OH`, `Manual`. */
  canal: string;
  /** Cuando la comisión es solo de una vivienda. */
  viviendaRef?: string | null;
  platformPct: number | string;
  /** `null` = la comisión bancaria general. */
  bankPct?: number | string | null;
  /** `false` = es un supuesto, no un dato comprobado. */
  confirmado?: boolean;
  nota?: string | null;
}

export interface VolcadoEntrante {
  propietarios?: PropietarioEntrante[];
  grupos?: GrupoEntrante[];
  viviendas?: ViviendaEntrante[];
  movimientos?: MovimientoEntrante[];
  tarifas?: TarifaEntrante[];
  preciosCerrados?: PrecioCerradoEntrante[];
  comisiones?: ComisionEntrante[];
}

export interface TarifaLista {
  ref: string;
  nombre: string;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  lineas: { servicio: Servicio; base: number; huespedesIncluidos: number; porHuespedAdicional: number }[];
}

export interface PrecioCerradoListo {
  viviendaRef: string;
  servicio: Servicio;
  precio: number;
}

export interface MovimientoListo {
  origenHash: string;
  tipo: TipoDeMovimiento;
  fecha: Date | null;
  concepto: string;
  importe: number;
  proveedor: string | null;
  reparto: Reparto;
  revisar: string | null;
  viviendaRef: string | null;
  grupoRef: string | null;
  propietarioRef: string | null;
}

export interface ComisionLista {
  canal: string;
  /** La referencia de la vivienda en el volcado, o `null` para todas. */
  viviendaRef: string | null;
  platformPct: number;
  bankPct: number | null;
  confirmado: boolean;
  nota: string | null;
}

export interface VolcadoRevisado {
  propietarios: PropietarioEntrante[];
  grupos: GrupoEntrante[];
  viviendas: ViviendaEntrante[];
  movimientos: MovimientoListo[];
  tarifas: TarifaLista[];
  preciosCerrados: PrecioCerradoListo[];
  comisiones: ComisionLista[];
  /** Lo que no se ha podido importar, con el porqué. Nunca se calla. */
  rechazados: { que: string; porque: string }[];
  /** Lo que se sabe aquí y no se ha podido aplicar a lo que venía. */
  avisos: { que: string; porque: string }[];
}

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Una fecha del volcado. `null` cuando no viene; error cuando no se entiende. */
function leerFecha(v: unknown): { fecha: Date | null; mal: boolean } {
  if (v === null || v === undefined || v === "") return { fecha: null, mal: false };
  if (typeof v !== "string") return { fecha: null, mal: true };
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { fecha: null, mal: true };
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Mediodía UTC: así ningún huso mueve el apunte al día anterior.
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  if (d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1) return { fecha: null, mal: true };
  return { fecha: d, mal: false };
}

/** Un porcentaje del volcado. `null` cuando no es un número entre 0 y 100. */
function leerPorcentaje(v: unknown): number | null {
  const n = leerImporte(v);
  if (n === null || n < 0 || n > 100) return null;
  return n;
}

/** La forma canónica del nombre de una vivienda, para emparejarlas. */
function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Qué comisión de canal acaba entrando.
 *
 * Mirador tiene cuatro canales, y **dos de ellos los marca él mismo como
 * supuestos**: Booking al 15 % «pendiente de contrastar con una factura real»
 * y Airbnb al 15 % «el más dudoso». Los otros dos —reserva directa y reserva
 * a mano, las dos al 0 %— sí los da por buenos.
 *
 * Así que la regla es: **lo comprobado manda sobre lo supuesto**. De Mirador
 * entra todo lo que aquí no está contrastado (los dos canales al 0 %, que
 * hacían falta y no se tenían), y donde los dos hablan del mismo canal, se
 * queda el porcentaje que se ha podido comprobar contra papeles reales.
 *
 * Ninguna de las dos cosas se pierde en silencio: cada supuesto descartado y
 * cada vivienda que no aparece salen en el parte con su motivo.
 */
export function fusionarComisiones(
  deMirador: ComisionLista[],
  viviendas: { ref: string; nombre: string }[]
): {
  comisiones: ComisionLista[];
  /** De lo que mandó Mirador, lo que no se ha guardado. */
  rechazados: { que: string; porque: string }[];
  /** De lo comprobado aquí, lo que no se ha podido aplicar. */
  avisos: { que: string; porque: string }[];
} {
  const rechazados: { que: string; porque: string }[] = [];
  const avisos: { que: string; porque: string }[] = [];
  const refPorNombre = new Map(viviendas.map((v) => [normalizarNombre(v.nombre), v.ref]));

  const comisiones: ComisionLista[] = [];
  const clave = (c: { canal: string; viviendaRef: string | null }) =>
    `${normalizarCanal(c.canal)}|${c.viviendaRef ?? ""}`;
  const puestas = new Map<string, ComisionLista>();

  for (const c of COMISIONES_CONTRASTADAS) {
    let viviendaRef: string | null = null;
    if (c.vivienda) {
      const ref = refPorNombre.get(normalizarNombre(c.vivienda));
      if (!ref) {
        avisos.push({
          que: `comisión de ${c.canal} en ${c.vivienda}`,
          porque: "esa vivienda no viene en el volcado, así que su porcentaje propio no se aplica",
        });
        continue;
      }
      viviendaRef = ref;
    }
    const lista: ComisionLista = {
      canal: c.canal,
      viviendaRef,
      platformPct: c.platformPct,
      bankPct: c.bankPct,
      confirmado: true,
      nota: c.nota,
    };
    puestas.set(clave(lista), lista);
    comisiones.push(lista);
  }

  for (const c of deMirador) {
    const ya = puestas.get(clave(c));
    if (ya) {
      const mismoPct = Math.abs(ya.platformPct - c.platformPct) < 0.001;
      rechazados.push({
        que: `comisión de ${c.canal}`,
        porque: mismoPct
          ? `Mirador dice lo mismo (${c.platformPct} %); se queda el dato comprobado, que además lleva comisión bancaria`
          : `Mirador dice ${c.platformPct} %${c.confirmado ? "" : " (supuesto suyo)"} y aquí está comprobado ${ya.platformPct} %; manda lo comprobado`,
      });
      continue;
    }
    // Mirador no contempla comisión bancaria: ninguna de sus filas la trae.
    // Dejarla a nulo la haría caer en la general —un 2,5 % que no es el
    // vuestro—, o sea inventarle un cargo a una reserva directa y pagarle de
    // menos al propietario. Entre inventar de más e inventar de menos, se
    // deja en cero y se dice de dónde viene.
    const sinBanco = c.bankPct === null;
    puestas.set(clave(c), c);
    comisiones.push(
      sinBanco
        ? {
            ...c,
            bankPct: 0,
            nota: [c.nota, "Mirador no recoge comisión bancaria de este canal; queda a cero hasta contrastarlo."]
              .filter(Boolean)
              .join(" "),
          }
        : c
    );
  }

  return { comisiones, rechazados, avisos };
}

/**
 * Pasa el volcado por el molde y dice qué se puede importar y qué no.
 *
 * No escribe nada: decide. Lo que rechaza sale con su motivo, porque una
 * importación que se traga la mitad de las filas en silencio es peor que una
 * que falla entera.
 */
export function revisarVolcado(bruto: unknown): VolcadoRevisado {
  const v = (bruto ?? {}) as VolcadoEntrante;
  const rechazados: { que: string; porque: string }[] = [];

  const propietarios = (v.propietarios ?? []).filter((p) => {
    if (!texto(p?.ref) || !texto(p?.nombre)) {
      rechazados.push({ que: `propietario ${p?.nombre ?? "sin nombre"}`, porque: "le falta el nombre o la referencia" });
      return false;
    }
    return true;
  });

  const refsPropietario = new Set(propietarios.map((p) => p.ref));

  const grupos = (v.grupos ?? []).filter((g) => {
    if (!texto(g?.ref) || !texto(g?.nombre)) {
      rechazados.push({ que: `grupo ${g?.nombre ?? "sin nombre"}`, porque: "le falta el nombre o la referencia" });
      return false;
    }
    if (!refsPropietario.has(g.propietarioRef)) {
      rechazados.push({ que: `grupo ${g.nombre}`, porque: "su propietario no viene en el volcado" });
      return false;
    }
    return true;
  });

  const refsGrupo = new Set(grupos.map((g) => g.ref));

  const viviendas = (v.viviendas ?? []).filter((x) => {
    if (!texto(x?.ref) || !texto(x?.nombre)) {
      rechazados.push({ que: `vivienda ${x?.nombre ?? "sin nombre"}`, porque: "le falta el nombre o la referencia" });
      return false;
    }
    // Una vivienda cuyo grupo no viene se importa igual, pero sin grupo: es
    // mejor tenerla suelta que perderla.
    if (x.grupoRef && !refsGrupo.has(x.grupoRef)) {
      rechazados.push({ que: `vivienda ${x.nombre}`, porque: "su grupo no viene en el volcado; entra sin grupo" });
      x.grupoRef = null;
    }
    return true;
  });

  const refsVivienda = new Set(viviendas.map((x) => x.ref));
  const huellasVistas = new Set<string>();
  const movimientos: MovimientoListo[] = [];

  for (const m of v.movimientos ?? []) {
    const huella = texto(m?.origenHash);
    const concepto = texto(m?.concepto);
    const importe = leerImporte(m?.importe);

    if (!huella) {
      rechazados.push({ que: `movimiento ${concepto ?? "sin concepto"}`, porque: "no trae huella de origen, así que no se puede evitar duplicarlo" });
      continue;
    }
    if (huellasVistas.has(huella)) {
      rechazados.push({ que: `movimiento ${concepto ?? huella}`, porque: "viene repetido en el mismo volcado" });
      continue;
    }
    if (!concepto) {
      rechazados.push({ que: `movimiento ${huella}`, porque: "no trae concepto" });
      continue;
    }
    // Aquí no se aplica la regla del cero: un apunte de 0 € del banco puede
    // ser real. Lo que no vale es que no haya número.
    if (importe === null) {
      rechazados.push({ que: `movimiento ${concepto}`, porque: "el importe no es un número" });
      continue;
    }

    const { fecha, mal } = leerFecha(m.fecha);
    if (mal) {
      rechazados.push({ que: `movimiento ${concepto}`, porque: `no entiendo la fecha «${String(m.fecha)}»; entra sin fecha` });
    }

    const tipo = (TIPOS as string[]).includes(m.tipo ?? "") ? (m.tipo as TipoDeMovimiento) : "gasto";
    const reparto = (REPARTOS as string[]).includes(m.reparto ?? "")
      ? (m.reparto as Reparto)
      : "directo";

    huellasVistas.add(huella);
    movimientos.push({
      origenHash: huella,
      tipo,
      fecha,
      concepto,
      importe,
      proveedor: texto(m.proveedor),
      reparto,
      revisar: texto(m.revisar),
      viviendaRef: m.viviendaRef && refsVivienda.has(m.viviendaRef) ? m.viviendaRef : null,
      grupoRef: m.grupoRef && refsGrupo.has(m.grupoRef) ? m.grupoRef : null,
      propietarioRef:
        m.propietarioRef && refsPropietario.has(m.propietarioRef) ? m.propietarioRef : null,
    });
  }

  // ── Tarifas de limpieza ─────────────────────────────────────────────
  // Una tarifa sin línea que valga no sirve de nada: mejor rechazarla y que
  // se vea, que dejarla vacía y que las limpiezas salgan sin precio.
  const tarifas: TarifaLista[] = [];
  for (const t of v.tarifas ?? []) {
    if (!texto(t?.ref) || !texto(t?.nombre)) {
      rechazados.push({ que: `tarifa ${t?.nombre ?? "sin nombre"}`, porque: "le falta el nombre o la referencia" });
      continue;
    }
    const desde = leerFecha(t.vigenteDesde);
    const hasta = leerFecha(t.vigenteHasta);
    const lineas = (t.lineas ?? [])
      .filter((l) => (SERVICIOS as string[]).includes(l?.servicio))
      .map((l) => ({
        servicio: l.servicio as Servicio,
        base: leerImporte(l.base) ?? 0,
        huespedesIncluidos: Number.isFinite(Number(l.huespedesIncluidos)) ? Number(l.huespedesIncluidos) : 0,
        porHuespedAdicional: leerImporte(l.porHuespedAdicional) ?? 0,
      }));
    if (lineas.length === 0) {
      rechazados.push({ que: `tarifa ${t.nombre}`, porque: "no trae ninguna línea de servicio que se entienda" });
      continue;
    }
    tarifas.push({
      ref: t.ref,
      nombre: t.nombre,
      // Sin fecha de inicio se toma el principio de los tiempos: así la
      // tarifa vale desde siempre en vez de no valer nunca.
      vigenteDesde: desde.fecha ?? new Date(Date.UTC(2000, 0, 1, 12)),
      vigenteHasta: hasta.fecha,
      lineas,
    });
  }

  const refsTarifa = new Set(tarifas.map((t) => t.ref));
  for (const p of propietarios) {
    if (p.tarifaRef && !refsTarifa.has(p.tarifaRef)) {
      rechazados.push({ que: `propietario ${p.nombre}`, porque: "su tarifa no viene en el volcado; entra sin tarifa" });
      p.tarifaRef = null;
    }
  }

  const preciosCerrados: PrecioCerradoListo[] = [];
  for (const pc of v.preciosCerrados ?? []) {
    const precio = leerImporte(pc?.precio);
    if (!pc?.viviendaRef || !refsVivienda.has(pc.viviendaRef)) {
      rechazados.push({ que: "precio cerrado", porque: "su vivienda no viene en el volcado" });
      continue;
    }
    if (!(SERVICIOS as string[]).includes(pc.servicio)) {
      rechazados.push({ que: `precio cerrado de ${pc.viviendaRef}`, porque: `no entiendo el servicio «${pc.servicio}»` });
      continue;
    }
    // Aquí un 0 sí es válido: hay viviendas que no se facturan.
    if (precio === null) {
      rechazados.push({ que: `precio cerrado de ${pc.viviendaRef}`, porque: "el precio no es un número" });
      continue;
    }
    preciosCerrados.push({ viviendaRef: pc.viviendaRef, servicio: pc.servicio as Servicio, precio });
  }

  // ── Comisiones de canal ─────────────────────────────────────────────
  const deMirador: ComisionLista[] = [];
  for (const c of v.comisiones ?? []) {
    const canal = texto(c?.canal);
    if (!canal) {
      rechazados.push({ que: "comisión de canal", porque: "no trae el nombre del canal" });
      continue;
    }
    const platformPct = leerPorcentaje(c.platformPct);
    if (platformPct === null) {
      rechazados.push({ que: `comisión de ${canal}`, porque: `«${String(c.platformPct)}» no es un porcentaje entre 0 y 100` });
      continue;
    }
    // Una comisión de una vivienda que no viene no se puede guardar: sin la
    // vivienda no hay a qué colgarla, y guardarla como general la aplicaría a
    // todas, que es justo lo contrario de lo que dice.
    if (c.viviendaRef && !refsVivienda.has(c.viviendaRef)) {
      rechazados.push({ que: `comisión de ${canal}`, porque: "su vivienda no viene en el volcado" });
      continue;
    }
    const bankPct = c.bankPct === null || c.bankPct === undefined ? null : leerPorcentaje(c.bankPct);
    if (c.bankPct !== null && c.bankPct !== undefined && bankPct === null) {
      rechazados.push({ que: `comisión de ${canal}`, porque: `la comisión bancaria «${String(c.bankPct)}» no es un porcentaje; entra sin ella` });
    }
    deMirador.push({
      canal,
      viviendaRef: c.viviendaRef ?? null,
      platformPct,
      bankPct,
      // Sin decir nada, un porcentaje se da por comprobado. Mirador sí lo dice.
      confirmado: c.confirmado !== false,
      nota: texto(c.nota),
    });
  }

  const fusion = fusionarComisiones(deMirador, viviendas);
  rechazados.push(...fusion.rechazados);

  return {
    propietarios,
    grupos,
    viviendas,
    movimientos,
    tarifas,
    preciosCerrados,
    comisiones: fusion.comisiones,
    rechazados,
    avisos: fusion.avisos,
  };
}

/**
 * Cuánto de lo que se manda es nuevo y cuánto ya estaba.
 *
 * Sirve para poder decir «de 267 apuntes, 184 eran nuevos y 83 ya estaban»
 * en vez de «importado». Una importación que no dice qué hizo no se puede
 * comprobar.
 */
export function resumirImportacion(
  movimientos: MovimientoListo[],
  huellasQueYaEstaban: Set<string>
): { nuevos: number; repetidos: number; sinFecha: number } {
  let nuevos = 0;
  let repetidos = 0;
  let sinFecha = 0;
  for (const m of movimientos) {
    if (huellasQueYaEstaban.has(m.origenHash)) repetidos++;
    else nuevos++;
    if (m.fecha === null) sinFecha++;
  }
  return { nuevos, repetidos, sinFecha };
}

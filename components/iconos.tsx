/**
 * Una única familia de iconos para toda la aplicación: trazo de 1,75, esquinas
 * redondeadas, rejilla de 24 y siempre `currentColor`, para que hereden el
 * color del sitio donde se pongan.
 *
 * Están dibujados aquí, en SVG, y no traídos de una librería de iconos, por dos
 * motivos: no añadir una dependencia más al proyecto por unas pocas formas, y
 * porque los emojis que había antes en el menú (📋 📈 🗓️) los pinta cada
 * sistema operativo a su manera y no se pueden teñir del color de la marca.
 *
 * Son decorativos: van con `aria-hidden`, y el texto de al lado es el que
 * nombra la sección. Cuando un icono va solo (un botón sin texto), el botón
 * lleva su propio `aria-label`.
 */

export interface PropsIcono {
  /** Tamaño en píxeles (ancho y alto). */
  size?: number;
  className?: string;
}

function Svg({ size = 20, className = "", children }: PropsIcono & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* --- Secciones ----------------------------------------------------------- */

/** Panel del día: un calendario con el día de hoy marcado. */
export function IconoHoy(p: PropsIcono) {
  return (
    <Svg {...p}>
      <rect x="3.25" y="5" width="17.5" height="15.75" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.25 10h17.5" />
      <circle cx="12" cy="15.25" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** La semana y el año: barras. */
export function IconoGrafico(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M3.5 20.5h17" />
      <path d="M7.5 20.5v-5.5M12 20.5v-10.5M16.5 20.5v-7.5" />
    </Svg>
  );
}

export function IconoCalendario(p: PropsIcono) {
  return (
    <Svg {...p}>
      <rect x="3.25" y="5" width="17.5" height="15.75" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.25 10h17.5" />
    </Svg>
  );
}

/** Reservas: un tique. */
export function IconoReservas(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M4.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1.3a2.2 2.2 0 0 0 0 4.4v1.3a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-1.3a2.2 2.2 0 0 0 0-4.4z" />
      <path d="M10.5 7.5v9" />
    </Svg>
  );
}

export function IconoCasa(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.9 9.8V20h12.2V9.8" />
      <path d="M9.9 20v-5.2h4.2V20" />
    </Svg>
  );
}

/** Limpieza y mantenimiento: destellos. */
export function IconoLimpieza(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M10 3.5l1.5 4.2 4.2 1.5-4.2 1.5L10 15l-1.5-4.3L4.3 9.2l4.2-1.5z" />
      <path d="M17 14l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
    </Svg>
  );
}

/** Gastos: un recibo. */
export function IconoRecibo(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9.5 8.5h5M9.5 12.5h5" />
    </Svg>
  );
}

/** Informes: un documento con barras. */
export function IconoInforme(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M6.5 3.5h7l4.5 4.5v12.5h-11.5z" />
      <path d="M13.5 3.5V8h4.5" />
      <path d="M9.5 17.5v-2.5M12 17.5v-4.5M14.5 17.5v-1.5" />
    </Svg>
  );
}

/** Historial de facturas: un documento con líneas. */
export function IconoFactura(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M6.5 3.5h7l4.5 4.5v12.5h-11.5z" />
      <path d="M13.5 3.5V8h4.5" />
      <path d="M9.5 12.5h5M9.5 16h3.5" />
    </Svg>
  );
}

/** Facturación: el euro. */
export function IconoEuro(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M17.2 6.9a6.6 6.6 0 0 0-9.9 4.2" />
      <path d="M7.3 12.9a6.6 6.6 0 0 0 9.9 4.2" />
      <path d="M4.6 10.6h9.2M4.6 13.4h7.6" />
    </Svg>
  );
}

/** Ajustes: dos controles deslizantes. */
export function IconoAjustes(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M3.75 7.5h16.5M3.75 16.5h16.5" />
      <circle cx="9.5" cy="7.5" r="2.35" fill="var(--superficie)" />
      <circle cx="15" cy="16.5" r="2.35" fill="var(--superficie)" />
    </Svg>
  );
}

/** Mantenimiento: una llave inglesa. */
export function IconoMantenimiento(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M15.4 4.4a4.6 4.6 0 0 0-5.9 5.9L4 15.8a2 2 0 0 0 2.8 2.8l5.5-5.5a4.6 4.6 0 0 0 5.9-5.9l-2.6 2.6-2.4-.6-.6-2.4z" />
    </Svg>
  );
}

/* --- Interfaz ------------------------------------------------------------ */

export function IconoUsuario(p: PropsIcono) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.25" r="3.75" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
    </Svg>
  );
}

export function IconoSalir(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M14.5 4.5h3.25a1.75 1.75 0 0 1 1.75 1.75v11.5a1.75 1.75 0 0 1-1.75 1.75H14.5" />
      <path d="M10 8.5 6.5 12l3.5 3.5M6.5 12H15" />
    </Svg>
  );
}

export function IconoMas(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

export function IconoFlecha(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M5 12h13M13 7l5 5-5 5" />
    </Svg>
  );
}

export function IconoAtras(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M19 12H6M11 17l-5-5 5-5" />
    </Svg>
  );
}

export function IconoImprimir(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M7 8.5V3.5h10v5" />
      <path d="M7 17.5H5.25A1.75 1.75 0 0 1 3.5 15.75v-4.5A1.75 1.75 0 0 1 5.25 9.5h13.5a1.75 1.75 0 0 1 1.75 1.75v4.5a1.75 1.75 0 0 1-1.75 1.75H17" />
      <path d="M7 14.5h10v6H7z" />
    </Svg>
  );
}

/** Entrada de huéspedes: la flecha entra. */
export function IconoEntrada(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M9.5 4.5H6.25A1.75 1.75 0 0 0 4.5 6.25v11.5a1.75 1.75 0 0 0 1.75 1.75H9.5" />
      <path d="m14 8.5 3.5 3.5-3.5 3.5M17.5 12H9" />
    </Svg>
  );
}

/** Salida de huéspedes: la flecha sale. */
export function IconoSalida(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M14.5 4.5h3.25a1.75 1.75 0 0 1 1.75 1.75v11.5a1.75 1.75 0 0 1-1.75 1.75H14.5" />
      <path d="m10 8.5-3.5 3.5 3.5 3.5M6.5 12H15" />
    </Svg>
  );
}

export function IconoAviso(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M12 4.25 21 19.5H3z" />
      <path d="M12 10v3.75" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconoMenu(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconoCerrar(p: PropsIcono) {
  return (
    <Svg {...p}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

export function IconoBuscar(p: PropsIcono) {
  return (
    <Svg {...p}>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 4 4" />
    </Svg>
  );
}

/**
 * Mapa de iconos por clave.
 *
 * Las pantallas piden su icono por nombre (`icono="casa"`) en vez de pasar el
 * componente: una página de servidor no puede pasarle una función a un
 * componente de cliente, y casi todas las pantallas de esta aplicación se
 * pintan en el servidor.
 */
export const ICONOS = {
  hoy: IconoHoy,
  grafico: IconoGrafico,
  calendario: IconoCalendario,
  reservas: IconoReservas,
  casa: IconoCasa,
  limpieza: IconoLimpieza,
  recibo: IconoRecibo,
  informe: IconoInforme,
  factura: IconoFactura,
  euro: IconoEuro,
  ajustes: IconoAjustes,
  mantenimiento: IconoMantenimiento,
  usuario: IconoUsuario,
  entrada: IconoEntrada,
  salida: IconoSalida,
  aviso: IconoAviso,
  buscar: IconoBuscar,
} as const;

export type ClaveDeIcono = keyof typeof ICONOS;

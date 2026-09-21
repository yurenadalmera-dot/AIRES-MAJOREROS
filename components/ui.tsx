"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ICONOS,
  IconoAtras,
  IconoAviso,
  IconoFlecha,
  IconoImprimir,
  type ClaveDeIcono,
} from "@/components/iconos";

/* -------------------------------------------------------------------------
   Cabecera de pantalla
   ------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  serif = false,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Títulos principales de sección en serif; el resto, en sans. */
  serif?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-6">
      <div className="min-w-0">
        <h1
          className={
            serif
              ? "serif text-[1.75rem] leading-tight text-marina"
              : "text-xl font-semibold text-tinta"
          }
        >
          {title}
        </h1>
        {subtitle && <p className="text-sm text-tinta-suave mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Indicadores
   ------------------------------------------------------------------------- */

/**
 * Una cifra del panel.
 *
 * `tone` colorea la cifra, pero nunca es lo único que distingue un estado de
 * otro: cuando algo pide atención se usa `alerta`, que además añade el icono
 * de aviso y un borde propio. Así se diferencia a simple vista un indicador
 * informativo (cuántas viviendas hay) de uno que reclama una acción (cuántas
 * limpiezas quedan pendientes).
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  alerta = false,
  href,
  icono,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad" | "ocean";
  alerta?: boolean;
  href?: string;
  icono?: ClaveDeIcono;
}) {
  const Icono = icono ? ICONOS[icono] : null;
  const colorCifra =
    tone === "good"
      ? "text-bien"
      : tone === "warn"
        ? "text-aviso"
        : tone === "bad"
          ? "text-mal"
          : tone === "ocean"
            ? "text-oceano-oscuro"
            : "text-marina";

  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">{label}</p>
        {alerta ? (
          <IconoAviso size={16} className="text-aviso" />
        ) : Icono ? (
          <Icono size={16} className="text-borde-fuerte" />
        ) : null}
      </div>
      <p className={`cifra text-[1.75rem] font-semibold leading-none mt-2 ${colorCifra}`}>{value}</p>
      {hint && <p className="text-xs text-tinta-suave mt-1.5">{hint}</p>}
    </>
  );

  const clases = `card p-4 ${alerta ? "border-l-4 border-l-acento" : ""} ${
    href ? "block transition-shadow hover:shadow-md" : ""
  }`;

  return href ? (
    <Link href={href} className={clases}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/* -------------------------------------------------------------------------
   Etiquetas de estado
   ------------------------------------------------------------------------- */

export type TonoBadge = "neutro" | "info" | "bien" | "aviso" | "mal";

/**
 * Etiqueta de estado. Acepta un `tono` de la paleta o, por compatibilidad con
 * las pantallas que ya pasaban clases de Tailwind a mano, un `className`.
 */
export function Badge({
  children,
  tono,
  className = "",
}: {
  children: React.ReactNode;
  tono?: TonoBadge;
  className?: string;
}) {
  const clase = tono ? `badge-${tono}` : className || "badge-neutro";
  return <span className={`badge ${clase}`}>{children}</span>;
}

/* -------------------------------------------------------------------------
   Vacíos, carga y errores
   ------------------------------------------------------------------------- */

/**
 * Un hueco vacío no es un error: dice qué se vería ahí y, cuando tiene
 * sentido, ofrece la acción que lo llenaría.
 */
export function EmptyState({
  message,
  accion,
  icono,
}: {
  message: string;
  accion?: { href: string; label: string };
  icono?: ClaveDeIcono;
}) {
  const Icono = icono ? ICONOS[icono] : null;
  return (
    <div className="rounded-xl border border-dashed border-borde-fuerte bg-marina-suave px-6 py-8 text-center">
      {Icono && <Icono size={26} className="mx-auto mb-2 text-borde-fuerte" />}
      <p className="text-sm text-tinta-suave">{message}</p>
      {accion && (
        <Link href={accion.href} className="btn-secondary mt-3 text-xs">
          {accion.label}
        </Link>
      )}
    </div>
  );
}

/** Barras grises mientras llegan los datos, con el mismo hueco que ocuparán. */
export function Cargando({ filas = 3 }: { filas?: number }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="esqueleto h-10 w-full" />
      ))}
    </div>
  );
}

/** Aviso en pantalla: algo que hay que leer, sin que parezca un error grave. */
export function Aviso({
  children,
  tono = "aviso",
}: {
  children: React.ReactNode;
  tono?: "aviso" | "mal" | "info";
}) {
  const clases =
    tono === "mal"
      ? "bg-mal-suave text-mal border-[#f3d4d3]"
      : tono === "info"
        ? "bg-oceano-suave text-oceano-oscuro border-[#d3e3ef]"
        : "bg-aviso-suave text-aviso border-[#f6e0c4]";
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${clases}`}>
      <IconoAviso size={18} className="mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Botones de uso general
   ------------------------------------------------------------------------- */

export function PrintButton({ label = "Imprimir / Guardar PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="btn-secondary no-print">
      <IconoImprimir size={16} />
      {label}
    </button>
  );
}

export function BackButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(href)} className="btn-secondary no-print">
      <IconoAtras size={16} />
      Volver
    </button>
  );
}

/** Enlace discreto de «ver más», con la flecha del sistema. */
export function EnlaceVer({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="enlace inline-flex items-center gap-1 text-xs">
      {children}
      <IconoFlecha size={14} />
    </Link>
  );
}

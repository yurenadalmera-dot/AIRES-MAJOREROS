/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

/**
 * Los logotipos de las dos empresas.
 *
 * La plataforma lleva dos marcas, una por negocio: **Mirador de Sotavento
 * Apartments** en la operativa de alquiler y **Aires Majoreros** en la de
 * limpiezas y mantenimiento. No es decoración: son dos empresas distintas, y
 * la factura de limpiezas la emite Aires Majoreros SL.
 *
 * Son PNG con transparencia (`public/marca/`), no SVG: los originales son
 * imágenes de píxeles, y dibujarlos de nuevo en vectores sería inventarse los
 * logotipos. Por eso se sirven a más resolución de la que se ve en pantalla,
 * para que se mantengan nítidos en pantallas densas.
 *
 * Reglas que respeta el componente:
 *  - La proporción nunca se toca: se limita el alto y el ancho va solo. Si el
 *    hueco es más estrecho de lo que cabe, encoge entero en vez de deformarse.
 *  - Siempre sobre una superficie clara y con margen alrededor.
 *  - Sin sombras, filtros ni recortes.
 *  - En sitios estrechos se usa la versión de símbolo, en vez de encoger el
 *    nombre completo hasta que no se lea.
 *
 * Se usa `<img>` y no `next/image` a propósito: el hosting arranca la
 * aplicación con `next start` sin `sharp`, y el optimizador de imágenes de
 * Next fallaría en producción con algo tan simple como un logotipo.
 */

export type Negocio = "rental" | "cleaning";

interface Fuente {
  src: string;
  ancho: number;
  alto: number;
}

interface DefinicionDeMarca {
  nombre: string;
  completo: Fuente;
  simbolo: Fuente;
  /** Alto máximo al que el nombre completo se sigue leyendo cómodamente. */
  altoBarra: number;
}

export const MARCAS: Record<Negocio, DefinicionDeMarca> = {
  rental: {
    nombre: "Mirador de Sotavento Apartments",
    completo: { src: "/marca/mirador-de-sotavento.png", ancho: 1024, alto: 303 },
    simbolo: { src: "/marca/mirador-simbolo.png", ancho: 512, alto: 312 },
    altoBarra: 64,
  },
  cleaning: {
    nombre: "Aires Majoreros · Limpiezas y mantenimiento de casas vacacionales",
    completo: { src: "/marca/aires-majoreros.png", ancho: 800, alto: 202 },
    simbolo: { src: "/marca/aires-simbolo.png", ancho: 256, alto: 160 },
    // Más apaisado que el de Mirador, así que a 64 no cabría en la barra.
    altoBarra: 54,
  },
};

export function Marca({
  negocio,
  variante = "completo",
  alto,
  className = "",
}: {
  negocio: Negocio;
  variante?: "completo" | "simbolo";
  /** Alto máximo en píxeles. Por defecto, el que le va bien a cada marca. */
  alto?: number;
  className?: string;
}) {
  const marca = MARCAS[negocio];
  const fuente = variante === "simbolo" ? marca.simbolo : marca.completo;
  const limite = alto ?? marca.altoBarra;
  return (
    <img
      src={fuente.src}
      width={fuente.ancho}
      height={fuente.alto}
      alt={marca.nombre}
      className={className}
      // `max-*` con `width`/`height` en auto: el navegador respeta la
      // proporción original y encoge el logotipo entero si el hueco es
      // estrecho. Fijar el alto a secas lo deformaría al quedarse sin sitio.
      style={{ maxHeight: limite, maxWidth: "100%", width: "auto", height: "auto" }}
    />
  );
}

/** El logotipo como enlace al inicio de su negocio. */
export function MarcaEnlace({
  negocio,
  href,
  variante = "completo",
  alto,
}: {
  negocio: Negocio;
  href: string;
  variante?: "completo" | "simbolo";
  alto?: number;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center"
      aria-label={`${MARCAS[negocio].nombre} · Ir al inicio`}
    >
      <Marca negocio={negocio} variante={variante} alto={alto} />
    </Link>
  );
}

/**
 * Las dos marcas juntas, para las pantallas que no son de ningún negocio en
 * concreto: la de entrada y la de la cuenta. Ahí todavía no se sabe a cuál de
 * los dos va a entrar cada persona, así que enseñar solo una sería elegir por
 * ella.
 */
export function MarcaDoble({ className = "" }: { className?: string }) {
  return (
    // Alturas distintas a propósito: los dos logotipos tienen proporciones
    // distintas, y a la misma altura uno se comería al otro. Así pesan igual.
    <div className={`flex flex-col items-center gap-5 ${className}`}>
      <Marca negocio="rental" alto={72} />
      <span aria-hidden className="h-px w-20 bg-borde-fuerte" />
      <Marca negocio="cleaning" alto={66} />
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

/**
 * El logotipo de Mirador de Sotavento Apartments.
 *
 * Es un PNG con transparencia (`public/marca/`), no un SVG: el original que
 * hay es una imagen de píxeles, y dibujarlo de nuevo a mano en vectores sería
 * inventarse el logotipo. Por eso se sirve a más resolución de la que se ve en
 * pantalla, para que se mantenga nítido en pantallas densas.
 *
 * Reglas que respeta el componente:
 *  - La proporción nunca se toca: se fija el alto y el ancho va solo.
 *  - Siempre sobre una superficie clara y con margen alrededor.
 *  - Sin sombras, filtros ni recortes.
 *  - En sitios estrechos se usa la versión de símbolo (sol, montaña y olas),
 *    en vez de encoger el nombre completo hasta que no se lea.
 *
 * Se usa `<img>` y no `next/image` a propósito: el hosting arranca la
 * aplicación con `next start` sin `sharp`, y el optimizador de imágenes de
 * Next fallaría en producción con algo tan simple como un logotipo.
 */

/** Tamaño real de los ficheros, para reservar el hueco y evitar saltos. */
const COMPLETO = { src: "/marca/mirador-de-sotavento.png", ancho: 1024, alto: 303 };
const SIMBOLO = { src: "/marca/mirador-simbolo.png", ancho: 512, alto: 312 };

const NOMBRE = "Mirador de Sotavento Apartments";

export function Marca({
  variante = "completo",
  alto = 62,
  className = "",
}: {
  variante?: "completo" | "simbolo";
  /** Alto en píxeles. El ancho se calcula solo a partir del original. */
  alto?: number;
  className?: string;
}) {
  const fuente = variante === "simbolo" ? SIMBOLO : COMPLETO;
  return (
    <img
      src={fuente.src}
      width={fuente.ancho}
      height={fuente.alto}
      alt={NOMBRE}
      className={className}
      style={{ height: alto, width: "auto" }}
    />
  );
}

/** El logotipo como enlace al inicio, tal y como aparece en la barra lateral. */
export function MarcaEnlace({
  href,
  variante = "completo",
  alto = 62,
}: {
  href: string;
  variante?: "completo" | "simbolo";
  alto?: number;
}) {
  return (
    <Link href={href} className="inline-flex items-center" aria-label={`${NOMBRE} · Ir al inicio`}>
      <Marca variante={variante} alto={alto} />
    </Link>
  );
}

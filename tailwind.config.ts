import type { Config } from "tailwindcss";

/**
 * Los valores de la identidad visual están en `app/globals.css`, como variables
 * CSS. Aquí solo se les pone nombre para poder escribirlos como utilidades
 * (`bg-marina`, `text-tinta-suave`, `border-borde`). Así no hay dos listas de
 * colores que mantener sincronizadas.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // `lib/` también: ahí viven los mapas de estado a clase (por ejemplo
    // `PROPERTY_STATUS_COLOR`). Sin esta línea, Tailwind no ve esas clases,
    // las da por no usadas y las borra: las etiquetas de estado salían todas
    // grises.
    "./lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        marina: {
          DEFAULT: "var(--marina)",
          oscuro: "var(--marina-oscuro)",
          suave: "var(--marina-suave)",
        },
        oceano: {
          DEFAULT: "var(--oceano)",
          oscuro: "var(--oceano-oscuro)",
          suave: "var(--oceano-suave)",
        },
        acento: {
          DEFAULT: "var(--acento)",
          texto: "var(--acento-texto)",
          suave: "var(--acento-suave)",
        },
        arena: "var(--arena)",
        fondo: "var(--fondo)",
        superficie: "var(--superficie)",
        tinta: {
          DEFAULT: "var(--tinta)",
          suave: "var(--tinta-suave)",
        },
        borde: {
          DEFAULT: "var(--borde)",
          fuerte: "var(--borde-fuerte)",
        },
        bien: { DEFAULT: "var(--bien)", suave: "var(--bien-suave)" },
        aviso: { DEFAULT: "var(--aviso)", suave: "var(--aviso-suave)" },
        mal: { DEFAULT: "var(--mal)", suave: "var(--mal-suave)" },
      },
      fontFamily: {
        sans: "var(--fuente-sans)",
        serif: "var(--fuente-serif)",
      },
      // 12px era demasiado pequeño para leer datos a diario. El resto de la
      // escala se queda como está para no mover las pantallas existentes.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],
      },
      borderRadius: {
        lg: "var(--radio)",
        xl: "var(--radio-lg)",
      },
      boxShadow: {
        sm: "var(--sombra)",
        DEFAULT: "var(--sombra)",
        md: "var(--sombra-media)",
      },
    },
  },
  plugins: [],
};
export default config;

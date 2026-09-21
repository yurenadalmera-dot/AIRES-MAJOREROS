import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plataforma de gestión · Alquileres y Limpiezas",
  description:
    "Panel operativo para gestión de alquileres vacacionales y facturación de servicios de limpieza.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/*
          Las tipografías se cargan con un <link> y no con `next/font`: el build
          de Hostinger ya ha fallado antes por cosas que necesitaban red, y
          `next/font` descarga las fuentes durante el build. Así, si Google
          Fonts no responde, la aplicación se sigue viendo con la tipografía del
          sistema (declarada como alternativa en `globals.css`) en vez de no
          compilar.

          Inter para todo lo operativo; Cormorant Garamond solo para la portada
          y algunos títulos, por eso de esta última solo se piden dos grosores.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

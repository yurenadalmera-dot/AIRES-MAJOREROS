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
      <body>{children}</body>
    </html>
  );
}

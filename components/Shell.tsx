"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { puede, type Permiso } from "@/lib/permisos";
import { Marca, MarcaEnlace, MARCAS } from "@/components/Marca";
import {
  ICONOS,
  IconoCerrar,
  IconoFlecha,
  IconoMenu,
  IconoSalir,
  IconoUsuario,
  type ClaveDeIcono,
} from "@/components/iconos";

interface NavItem {
  /** Sin este permiso, la sección no se enseña. */
  permiso: Permiso;
  href: string;
  label: string;
  icono: ClaveDeIcono;
}

interface ShellProps {
  businessName: string;
  otherBusinessName: string;
  activeBusiness: "rental" | "cleaning";
  userName: string;
  userRole: string;
  /** El rol en crudo, para decidir qué secciones se ven. */
  rol: string;
  children: React.ReactNode;
}

const RENTAL_NAV: NavItem[] = [
  { href: "/rental", label: "Panel del día", icono: "hoy", permiso: "operativa.alquiler" },
  { href: "/rental/panel", label: "La semana y el año", icono: "grafico", permiso: "operativa.alquiler" },
  { href: "/rental/calendar", label: "Calendario semanal", icono: "calendario", permiso: "operativa.alquiler" },
  { href: "/rental/bookings", label: "Reservas", icono: "reservas", permiso: "operativa.alquiler" },
  { href: "/rental/properties", label: "Viviendas", icono: "casa", permiso: "operativa.alquiler" },
  { href: "/rental/tasks", label: "Mantenimiento", icono: "mantenimiento", permiso: "operativa.estado_tarea" },
  { href: "/rental/viajeros", label: "Partes de viajeros", icono: "usuario", permiso: "operativa.alquiler" },
  { href: "/rental/gastos", label: "Gastos", icono: "recibo", permiso: "operativa.alquiler" },
  { href: "/rental/reports", label: "Informes propietarios", icono: "informe", permiso: "operativa.alquiler" },
  { href: "/rental/settings", label: "Ajustes", icono: "ajustes", permiso: "administracion" },
];

const CLEANING_NAV: NavItem[] = [
  { href: "/cleaning", label: "Facturación", icono: "euro", permiso: "facturacion" },
  { href: "/cleaning/invoices", label: "Historial de facturas", icono: "factura", permiso: "facturacion" },
  { href: "/cleaning/tasks", label: "Limpiezas", icono: "limpieza", permiso: "operativa.estado_tarea" },
  { href: "/cleaning/reports", label: "Informes propietarios", icono: "informe", permiso: "facturacion" },
  { href: "/cleaning/settings", label: "Reparto y ajustes", icono: "ajustes", permiso: "administracion" },
];

export default function Shell({
  businessName,
  otherBusinessName,
  activeBusiness,
  userName,
  userRole,
  rol,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  // En móvil el menú es un cajón que tapa la pantalla: al cambiar de sección
  // hay que cerrarlo, o la persona se queda mirando el menú en vez de la
  // pantalla a la que acaba de entrar.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  // Solo las secciones a las que esta persona puede entrar: enseñar un enlace
  // que acaba en un redirección es peor que no enseñarlo.
  const nav = (activeBusiness === "rental" ? RENTAL_NAV : CLEANING_NAV).filter((i) =>
    puede(rol, i.permiso)
  );
  const otherHref = activeBusiness === "rental" ? "/cleaning" : "/rental";
  const otroNegocio = activeBusiness === "rental" ? "cleaning" : "rental";

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/rental" || href === "/cleaning") return pathname === href;
    return pathname.startsWith(href);
  }

  // El nombre de la sección donde estamos, para la cabecera de móvil (donde no
  // se ve el menú). La coincidencia más larga gana, para que
  // `/rental/bookings/nueva` diga «Reservas» y no «Panel del día».
  const seccion =
    [...nav]
      .filter((i) => isActive(i.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? businessName;

  // El menú se pinta dos veces (la barra fija y el cajón de móvil), así que
  // cada copia lleva su propio nombre: dos navegaciones llamadas igual son un
  // acertijo para quien usa lector de pantalla.
  const menu = (nombre: string) => (
    <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label={nombre}>
      {nav.map((item) => {
        const Icono = ICONOS[item.icono];
        const activo = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activo ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-lg py-2.5 pl-4 pr-3 text-sm transition-colors ${
              activo
                ? "bg-marca-suave font-semibold text-marina"
                : "text-tinta-suave hover:bg-marina-suave hover:text-tinta"
            }`}
          >
            {/* La sección activa, además del fondo suave, lleva una barra
                vertical del color de la empresa: el color de fondo por sí solo
                no debería ser la única pista de dónde estamos. */}
            {activo && (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-marca"
              />
            )}
            <Icono size={19} className={activo ? "text-marca-media" : "text-borde-fuerte"} />
            <span className="min-w-0">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const negocio = (
    <div className="px-5 pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Negocio activo</p>
      <p className="mt-1 font-semibold leading-snug text-marina">{businessName}</p>
      <Link
        href={otherHref}
        className="mt-2.5 block rounded-lg border border-borde-fuerte px-3 py-2 transition-colors hover:bg-marina-suave"
      >
        <span className="block text-xs text-tinta-suave">Cambiar a</span>
        <span className="mt-1 flex items-center gap-2">
          {/* El símbolo del otro negocio, no su nombre completo: al otro lado
              hay otra empresa, no otra pestaña de la misma. Va el símbolo
              porque el logotipo entero, a este tamaño, no se leería. */}
          <Marca negocio={otroNegocio} variante="simbolo" alto={22} />
          {/* El nombre de la empresa se parte en dos líneas si hace falta,
              pero no se corta: un nombre a medias no dice a dónde se va. */}
          <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-tinta">
            {otherBusinessName}
          </span>
          <IconoFlecha size={13} className="text-tinta-suave" />
        </span>
      </Link>
    </div>
  );

  const barraLateral = (nombreDelMenu: string, enCajon = false) => (
    <>
      {/* En el cajón, el logotipo deja hueco a la derecha para el botón de
          cerrar: el logotipo no se recorta ni se le pone nada encima. */}
      <div className={`px-5 pt-6 pb-5 ${enCajon ? "pr-14" : ""}`}>
        <MarcaEnlace
          negocio={activeBusiness}
          href={activeBusiness === "rental" ? "/rental" : "/cleaning"}
          alto={enCajon ? MARCAS[activeBusiness].altoBarra - 10 : undefined}
        />
      </div>
      <div className="border-b border-borde" />
      <div className="pt-4">{negocio}</div>
      <div className="border-b border-borde mx-5" />
      <div className="flex-1 min-h-0 flex flex-col pt-2">{menu(nombreDelMenu)}</div>
    </>
  );

  return (
    <div className="min-h-screen lg:flex bg-fondo" data-negocio={activeBusiness}>
      {/* Menú fijo a partir de pantallas grandes. */}
      <aside
        className="no-print hidden lg:flex w-[264px] shrink-0 flex-col border-r border-borde bg-superficie"
        aria-hidden={menuAbierto || undefined}
      >
        {barraLateral("Secciones")}
      </aside>

      {/* Cajón de navegación para móvil y tableta. */}
      {menuAbierto && (
        <div className="no-print lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(16, 47, 80, 0.45)" }}
            onClick={() => setMenuAbierto(false)}
            aria-hidden
          />
          <aside className="relative z-10 flex w-[280px] max-w-[85vw] flex-col bg-superficie shadow-md">
            <button
              onClick={() => setMenuAbierto(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-tinta-suave hover:bg-marina-suave"
              aria-label="Cerrar el menú"
            >
              <IconoCerrar size={20} />
            </button>
            {barraLateral("Secciones del menú", true)}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-30 flex min-h-[3.75rem] items-center justify-between gap-3 border-b border-borde bg-superficie px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuAbierto(true)}
              className="lg:hidden rounded-lg p-2 text-tinta-suave hover:bg-marina-suave"
              aria-label="Abrir el menú"
              aria-expanded={menuAbierto}
            >
              <IconoMenu size={22} />
            </button>
            {/* En móvil no se ve el menú, así que la cabecera dice dónde
                estamos; en pantalla grande eso ya lo dice el propio menú y
                aquí se deja el contexto del negocio. */}
            <div className="min-w-0 lg:hidden flex items-center gap-2.5">
              <Marca negocio={activeBusiness} variante="simbolo" alto={26} />
              <p className="truncate font-semibold text-marina">{seccion}</p>
            </div>
            <p className="hidden lg:block truncate text-sm text-tinta-suave">
              {activeBusiness === "rental"
                ? "Gestión de alquileres vacacionales"
                : "Facturación de servicios de limpieza"}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/cuenta"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-right leading-tight hover:bg-marina-suave"
            >
              <IconoUsuario size={18} className="text-tinta-suave hidden sm:block" />
              <span className="hidden sm:block">
                <span className="block text-sm font-medium text-tinta">{userName}</span>
                <span className="block text-xs text-tinta-suave">{userRole} · Mi cuenta</span>
              </span>
              <IconoUsuario size={20} className="text-tinta-suave sm:hidden" />
              <span className="sr-only sm:hidden">{userName} · Mi cuenta</span>
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="btn-secondary px-2.5 py-1.5 text-xs"
            >
              <IconoSalir size={16} />
              <span className="hidden sm:inline">{loggingOut ? "Saliendo…" : "Salir"}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

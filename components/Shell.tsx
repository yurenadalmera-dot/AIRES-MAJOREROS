"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface ShellProps {
  businessName: string;
  otherBusinessName: string;
  activeBusiness: "rental" | "cleaning";
  userName: string;
  userRole: string;
  children: React.ReactNode;
}

const RENTAL_NAV: NavItem[] = [
  { href: "/rental", label: "Panel del día", icon: "📋" },
  { href: "/rental/calendar", label: "Calendario semanal", icon: "🗓️" },
  { href: "/rental/bookings", label: "Reservas", icon: "🛎️" },
  { href: "/rental/properties", label: "Viviendas", icon: "🏠" },
  { href: "/rental/tasks", label: "Limpieza y mantenimiento", icon: "🧹" },
  { href: "/rental/reports", label: "Informes propietarios", icon: "🧾" },
  { href: "/rental/settings", label: "Ajustes", icon: "⚙️" },
];

const CLEANING_NAV: NavItem[] = [
  { href: "/cleaning", label: "Facturación", icon: "💶" },
  { href: "/cleaning/invoices", label: "Historial de facturas", icon: "📄" },
  { href: "/cleaning/settings", label: "Reparto y ajustes", icon: "⚙️" },
];

export default function Shell({
  businessName,
  otherBusinessName,
  activeBusiness,
  userName,
  userRole,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const nav = activeBusiness === "rental" ? RENTAL_NAV : CLEANING_NAV;
  const otherHref = activeBusiness === "rental" ? "/cleaning" : "/rental";
  const theme = activeBusiness === "rental" ? "brand" : "aires";

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

  return (
    <div className="min-h-screen flex">
      <aside className="no-print w-64 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-800">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Negocio activo</p>
          <p className="font-semibold leading-tight mt-0.5">{businessName}</p>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href)
                  ? theme === "brand"
                    ? "bg-brand-600 text-white"
                    : "bg-aires-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-slate-800 space-y-2">
          <Link
            href={otherHref}
            className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
          >
            <span>Cambiar a</span>
            <span className="font-medium text-slate-100">{otherBusinessName} →</span>
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6">
          <p className="text-sm text-slate-500">
            {activeBusiness === "rental" ? "Gestión de alquileres vacacionales" : "Facturación de servicios de limpieza"}
          </p>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-slate-800">{userName}</p>
              <p className="text-xs text-slate-400">{userRole}</p>
            </div>
            <button onClick={handleLogout} disabled={loggingOut} className="btn-secondary text-xs py-1.5">
              Salir
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}

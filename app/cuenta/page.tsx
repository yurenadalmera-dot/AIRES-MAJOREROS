import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { USER_ROLE_LABEL } from "@/lib/constants";
import CambiarContrasena from "@/components/CambiarContrasena";

/**
 * Mi cuenta.
 *
 * Fuera de los dos paneles a propósito: no es de alquileres ni de limpiezas,
 * es de quien ha entrado. Cualquiera con sesión puede llegar, sin permisos.
 */
export default async function CuentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="card p-5">
          <h1 className="text-lg font-semibold text-slate-900">Mi cuenta</h1>
          <p className="text-sm text-slate-500 mt-1">{session.name}</p>
          <p className="text-xs text-slate-400">
            {session.email} · {USER_ROLE_LABEL[session.role] ?? session.role}
          </p>
        </div>

        <CambiarContrasena />

        <a href="/rental" className="block text-center text-sm text-brand-700 hover:underline">
          ← Volver a la aplicación
        </a>
      </div>
    </div>
  );
}

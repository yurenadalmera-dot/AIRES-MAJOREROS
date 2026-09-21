import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { USER_ROLE_LABEL } from "@/lib/constants";
import CambiarContrasena from "@/components/CambiarContrasena";
import { Marca } from "@/components/Marca";

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
    <div className="min-h-screen bg-arena py-10 px-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Esta pantalla vive fuera de los dos paneles, así que no tiene la
            barra lateral: el logotipo la ata al resto de la aplicación. */}
        <Marca alto={52} className="mx-auto mb-6" />

        <div className="card p-5">
          <h1 className="serif text-2xl text-marina">Mi cuenta</h1>
          <p className="text-sm font-medium text-tinta mt-1.5">{session.name}</p>
          <p className="text-xs text-tinta-suave">
            {session.email} · {USER_ROLE_LABEL[session.role] ?? session.role}
          </p>
        </div>

        <CambiarContrasena />

        <a href="/rental" className="block text-center text-sm text-oceano-oscuro hover:underline">
          ← Volver a la aplicación
        </a>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { USER_ROLE_LABEL } from "@/lib/constants";
import { primeraRutaPermitida } from "@/lib/business-context";
import CambiarContrasena from "@/components/CambiarContrasena";
import SalirDeLaSesion from "@/components/SalirDeLaSesion";
import { MarcaDoble } from "@/components/Marca";

/**
 * Mi cuenta.
 *
 * Fuera de los dos paneles a propósito: no es de alquileres ni de limpiezas,
 * es de quien ha entrado. Cualquiera con sesión puede llegar, sin permisos.
 *
 * Es también **la única pantalla que ve quien entra con una contraseña de un
 * solo uso**: todas las demás la mandan aquí hasta que se pone la suya. Por
 * eso en ese caso no hay «volver a la aplicación» —no hay adónde volver— y sí
 * una explicación de por qué está aquí, que si no parece un fallo.
 */
export default async function CuentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const obligatorio = session.debeCambiarContrasena;
  const inicio = primeraRutaPermitida(session.role);

  return (
    <div className="min-h-screen bg-arena py-10 px-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Esta pantalla vive fuera de los dos paneles, así que no tiene la
            barra lateral: los logotipos la atan al resto de la aplicación. */}
        <MarcaDoble className="mb-8" />

        <div className="card p-5">
          <h1 className="serif text-2xl text-marina">
            {obligatorio ? `Hola, ${session.name}` : "Mi cuenta"}
          </h1>
          {!obligatorio && <p className="text-sm font-medium text-tinta mt-1.5">{session.name}</p>}
          <p className={`text-xs text-tinta-suave ${obligatorio ? "mt-1.5" : ""}`}>
            {session.email} · {USER_ROLE_LABEL[session.role] ?? session.role}
          </p>
        </div>

        {obligatorio && (
          <div
            role="status"
            className="rounded-lg border border-[#f6e0c4] bg-aviso-suave px-4 py-3 text-sm text-aviso"
          >
            <p className="font-medium">Antes de empezar, pon tu propia contraseña.</p>
            <p className="mt-1">
              La que te han dado es de un solo uso: solo sirve para llegar hasta aquí. En cuanto
              guardes la tuya deja de valer, y la nueva no la conoce nadie más que tú.
            </p>
          </div>
        )}

        <CambiarContrasena obligatorio={obligatorio} destino={inicio} />

        {obligatorio ? (
          <p className="text-center text-sm text-tinta-suave">
            ¿No eres {session.name}?{" "}
            <SalirDeLaSesion className="text-oceano-oscuro hover:underline" />
          </p>
        ) : (
          <a href={inicio} className="block text-center text-sm text-oceano-oscuro hover:underline">
            ← Volver a la aplicación
          </a>
        )}
      </div>
    </div>
  );
}

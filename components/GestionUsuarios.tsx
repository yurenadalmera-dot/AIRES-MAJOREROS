"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLES, USER_ROLE_LABEL } from "@/lib/constants";
import {
  crearUsuario,
  restablecerContrasena,
  setUsuarioActivo,
  cambiarRolUsuario,
  cambiarNombreUsuario,
} from "@/lib/actions/usuarios";

interface UsuarioVisible {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  esYo: boolean;
}

/**
 * Altas y accesos.
 *
 * La contraseña se genera en el servidor y se enseña **una sola vez**, aquí,
 * para poder entregársela a esa persona. No se guarda en claro en ningún
 * sitio: si se pierde, se restablece — no se recupera.
 */
export default function GestionUsuarios({ usuarios }: { usuarios: UsuarioVisible[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reciente, setReciente] = useState<{ email: string; contrasena: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    setReciente(null);
    setCopiado(false);
    startTransition(async () => {
      const r = (await accion()) as { error?: string; creada?: { email: string; contrasena: string } };
      if (r && typeof r === "object" && "error" in r && r.error) {
        setError(String(r.error));
        return;
      }
      if (r && typeof r === "object" && r.creada) setReciente(r.creada);
      router.refresh();
    });
  }

  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-800 mb-1">Usuarios y accesos</h2>
      <p className="text-xs text-slate-500 mb-4">
        Cada persona entra con su propio correo. El rol decide qué ve y qué puede hacer.
      </p>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {reciente && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3">
          <p className="text-sm font-medium text-amber-900">
            Contraseña de {reciente.email}
          </p>
          <p className="font-mono text-lg tracking-wide text-amber-900 my-1 select-all break-all">
            {reciente.contrasena}
          </p>
          <p className="text-xs text-amber-800">
            Anótala ahora y entrégasela. <strong>No se puede volver a ver</strong>: si se pierde,
            hay que restablecerla. Conviene que la cambie al entrar, desde «Mi cuenta».
          </p>
          <button
            type="button"
            className="btn-secondary text-xs mt-2"
            onClick={() => {
              navigator.clipboard?.writeText(reciente.contrasena);
              setCopiado(true);
            }}
          >
            {copiado ? "Copiada ✓" : "Copiar"}
          </button>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">
                {/* El nombre se corrige escribiendo encima: las primeras cuentas
                    se crearon desde el arranque y podían traerlo mal. */}
                <input
                  defaultValue={u.name}
                  disabled={pending}
                  aria-label={`Nombre de ${u.email}`}
                  onBlur={(e) => {
                    const nuevo = e.target.value.trim();
                    if (nuevo && nuevo !== u.name) ejecutar(() => cambiarNombreUsuario(u.id, nuevo));
                    else e.target.value = u.name;
                  }}
                  className="bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-300 rounded px-1 -mx-1 w-full max-w-[16rem] focus:outline-none"
                />
                {u.esYo && <span className="text-xs text-slate-400 font-normal"> · tú</span>}
              </p>
              <p className="text-xs text-slate-400 truncate">{u.email}</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={u.role}
                disabled={pending || u.esYo}
                onChange={(e) => ejecutar(() => cambiarRolUsuario(u.id, e.target.value))}
                className="input py-1 text-xs"
              >
                {Object.values(USER_ROLES).map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABEL[r] ?? r}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={pending}
                onClick={() => ejecutar(() => restablecerContrasena(u.id))}
                className="text-xs text-brand-700 hover:underline"
              >
                Restablecer contraseña
              </button>

              <button
                type="button"
                disabled={pending || u.esYo}
                onClick={() => ejecutar(() => setUsuarioActivo(u.id, !u.active))}
                className="text-xs text-slate-500 hover:underline disabled:opacity-40"
              >
                {u.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <details>
        <summary className="cursor-pointer text-sm text-brand-700">+ Dar de alta a alguien</summary>
        <form
          action={(fd) => ejecutar(() => crearUsuario(fd))}
          className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label className="label" htmlFor="usuario-nombre">
              Nombre
            </label>
            <input id="usuario-nombre" name="name" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="usuario-email">
              Correo
            </label>
            <input id="usuario-email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="usuario-rol">
              Rol
            </label>
            <select id="usuario-rol" name="role" defaultValue={USER_ROLES.STAFF} className="input">
              {Object.values(USER_ROLES).map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button type="submit" disabled={pending} className="btn-secondary">
              {pending ? "Creando..." : "Crear y generar contraseña"}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

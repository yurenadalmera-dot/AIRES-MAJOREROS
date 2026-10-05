"use client";

import { useState } from "react";
import Link from "next/link";
import { MarcaDoble } from "@/components/Marca";
import { MINUTOS_DE_VALIDEZ_DEL_ENLACE } from "@/lib/acceso";

/**
 * «He olvidado mi contraseña».
 *
 * Se pide el correo y se contesta **siempre lo mismo**, exista o no una cuenta
 * con él. Si aquí pusiera «ese correo no está dado de alta», esta pantalla
 * serviría para averiguar quién tiene cuenta probando correos.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se ha podido pedir. Inténtalo de nuevo.");
        return;
      }
      setPedido(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-arena px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <MarcaDoble className="mb-8" />

        <div className="text-center mb-5">
          <h1 className="serif text-[1.75rem] leading-tight text-marina">
            ¿Has olvidado tu contraseña?
          </h1>
          {!pedido && (
            <p className="text-sm text-tinta-suave mt-1.5">
              Escribe el correo con el que entras y te mandamos un enlace para ponerte una nueva.
            </p>
          )}
        </div>

        {pedido ? (
          <div className="card p-6 sm:p-7 space-y-3" role="status">
            <p className="text-sm text-tinta">
              Si <strong className="break-all">{email}</strong> tiene cuenta, en un par de minutos
              le llegará un correo con un enlace para poner una contraseña nueva.
            </p>
            <ul className="text-sm text-tinta-suave list-disc pl-5 space-y-1">
              <li>El enlace caduca a los {MINUTOS_DE_VALIDEZ_DEL_ENLACE} minutos y sirve una sola vez.</li>
              <li>Si no lo ves, mira en la carpeta de correo no deseado.</li>
              <li>
                Si no llega, puede que ese no sea el correo de tu cuenta: pregunta a quien
                administra la aplicación.
              </li>
            </ul>
            <Link href="/login" className="btn-secondary w-full">
              Volver a la pantalla de entrada
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 sm:p-7 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            {error && (
              <p
                role="alert"
                className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}
            <button type="submit" disabled={enviando} className="btn-primary w-full">
              {enviando ? "Pidiendo…" : "Mandarme el enlace"}
            </button>
            <p className="text-center text-sm">
              <Link href="/login" className="enlace">
                Volver a la pantalla de entrada
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

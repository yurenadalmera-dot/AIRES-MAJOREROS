"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MarcaDoble } from "@/components/Marca";
import CampoContrasena from "@/components/CampoContrasena";
import { destinoTrasEntrar } from "@/lib/acceso";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  // Quien viene de ponerse una contraseña nueva desde el enlace del correo
  // llega aquí: hay que decirle que ha salido bien, o lo vuelve a intentar.
  const restablecida = params.get("restablecida") === "1";
  // Sin correo de ejemplo precargado: era una dirección inventada y en una
  // pantalla de verdad no pinta nada.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar sesión");
        setLoading(false);
        return;
      }
      // Cada rol empieza donde le sirve: el servidor dice cuál es su sitio.
      // Y quien entra con una contraseña de un solo uso va primero a cambiarla.
      router.push(
        destinoTrasEntrar({ debeCambiar: data.debeCambiar === true, next, inicio: data.inicio })
      );
      router.refresh();
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-arena px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="text-center mb-7">
          {/* Las dos empresas, sobre superficie clara y con aire alrededor.
              Desde aquí se entra a las dos, así que aquí están las dos. */}
          <MarcaDoble />
          <h1 className="serif text-[1.75rem] leading-tight text-marina mt-9">
            Plataforma de gestión
          </h1>
          <p className="text-sm text-tinta-suave mt-1.5">
            Alquileres vacacionales &amp; Limpiezas
          </p>
        </div>
        {restablecida && (
          <p
            role="status"
            className="text-sm text-bien bg-bien-suave border border-[#cfe6dd] rounded-lg px-3 py-2 mb-4"
          >
            Contraseña cambiada. Ya puedes entrar con la nueva.
          </p>
        )}
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
          {/* Sin `placeholder` con una contraseña: la de demostración estaba
              aquí escrita, a la vista de cualquiera que abriera la web. */}
          <CampoContrasena
            id="password"
            etiqueta="Contraseña"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
          {error && (
            <p
              role="alert"
              className="text-sm text-mal bg-mal-suave border border-[#f3d4d3] rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Entrando…" : "Entrar"}
          </button>
          {/* Debajo del botón y no pegado al campo: quien se sabe la contraseña
              no tiene que saltárselo con el tabulador para llegar a «Entrar». */}
          <p className="text-center text-sm">
            <Link href="/recuperar" className="enlace">
              ¿Has olvidado tu contraseña?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

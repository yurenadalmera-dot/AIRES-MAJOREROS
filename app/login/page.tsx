"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarcaDoble } from "@/components/Marca";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
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
      router.push(next || data.inicio || "/rental");
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
          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            {/* Sin `placeholder` con una contraseña: la de demostración estaba
                aquí escrita, a la vista de cualquiera que abriera la web. */}
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Entrando…" : "Entrar"}
          </button>
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generarEnlaceDelParte, borrarViajero } from "@/lib/actions/viajeros";
import { Aviso, Badge } from "@/components/ui";
import { TIPOS_DE_DOCUMENTO } from "@/lib/viajeros";

interface ViajeroVisible {
  id: string;
  titular: boolean;
  nombre: string;
  apellido1: string;
  apellido2: string | null;
  tipoDocumento: string;
  documento: string;
  numeroSoporte: string | null;
  nacionalidad: string;
  fechaNacimiento: string;
  parentesco: string | null;
}

/**
 * El parte de viajeros de una reserva, visto desde dentro.
 *
 * Lo que hace falta aquí es una cosa: mandarle al huésped el enlace para que
 * rellene él sus datos. Escribirlos a mano desde un WhatsApp con la foto del
 * DNI es lo que hay que dejar de hacer.
 *
 * El enlace se enseña **una sola vez**: de él solo se guarda la huella. Si se
 * pierde, se genera otro, y generar otro invalida el anterior.
 */
export default function ParteDeLaReserva({
  bookingId,
  viajeros,
  esperados,
  comunicadoEl,
  hayEnlace,
  expira,
}: {
  bookingId: string;
  viajeros: ViajeroVisible[];
  esperados: number;
  comunicadoEl: string | null;
  hayEnlace: boolean;
  expira: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function generar() {
    setError(null);
    setCopiado(false);
    startTransition(async () => {
      const r = (await generarEnlaceDelParte(bookingId)) as {
        error?: string;
        token?: string;
      };
      if (r?.error) {
        setError(r.error);
        return;
      }
      if (r?.token) setEnlace(`${window.location.origin}/viajeros/${r.token}`);
      router.refresh();
    });
  }

  function quitar(id: string) {
    if (!confirm("¿Quitar a esta persona del parte?")) return;
    startTransition(async () => {
      const r = (await borrarViajero(id)) as { error?: string };
      if (r?.error) setError(r.error);
      router.refresh();
    });
  }

  const caducado = expira ? new Date(expira) < new Date() : false;

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="card-titulo">
        <h2>Parte de viajeros</h2>
        <span className="cifra text-xs text-tinta-suave">
          {viajeros.length} de {esperados}
        </span>
      </div>

      {error && <Aviso tono="mal">{error}</Aviso>}

      {comunicadoEl ? (
        <p className="text-sm text-bien">
          Comunicado el {new Date(comunicadoEl).toLocaleDateString("es-ES")}.
        </p>
      ) : (
        <>
          {enlace ? (
            <div className="rounded-xl border border-[#cfe6dd] bg-bien-suave p-3 space-y-2">
              <p className="text-xs font-medium text-bien">
                Cópialo ahora: no se vuelve a enseñar.
              </p>
              <p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-tinta">
                {enlace}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(enlace);
                  setCopiado(true);
                }}
                className="btn-secondary text-xs"
              >
                {copiado ? "Copiado" : "Copiar el enlace"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-tinta-suave">
                Mándale este enlace al huésped y rellena él sus datos desde el móvil.
              </p>
              {hayEnlace && !caducado && (
                <p className="text-xs text-tinta-suave">
                  Ya hay uno generado{expira ? ` (vale hasta el ${new Date(expira).toLocaleDateString("es-ES")})` : ""}.
                  Generar otro invalida el anterior.
                </p>
              )}
              {caducado && <p className="text-xs text-aviso">El enlace anterior ha caducado.</p>}
              <button type="button" onClick={generar} disabled={pending} className="btn-secondary">
                {pending ? "Generando…" : hayEnlace ? "Generar otro enlace" : "Generar el enlace"}
              </button>
            </div>
          )}
        </>
      )}

      {viajeros.length > 0 && (
        <ul className="space-y-2">
          {viajeros.map((v) => (
            <li key={v.id} className="rounded-lg border border-borde px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tinta">
                    {v.nombre} {v.apellido1} {v.apellido2 ?? ""}
                    {v.titular && <Badge tono="info">titular</Badge>}
                  </p>
                  <p className="text-xs text-tinta-suave">
                    {TIPOS_DE_DOCUMENTO[v.tipoDocumento as keyof typeof TIPOS_DE_DOCUMENTO] ??
                      v.tipoDocumento}{" "}
                    {v.documento} · {v.nacionalidad} ·{" "}
                    {new Date(v.fechaNacimiento).toLocaleDateString("es-ES")}
                    {v.parentesco ? ` · ${v.parentesco}` : ""}
                  </p>
                </div>
                {!comunicadoEl && (
                  <button
                    type="button"
                    onClick={() => quitar(v.id)}
                    disabled={pending}
                    className="shrink-0 text-xs font-medium text-mal hover:underline disabled:opacity-50"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

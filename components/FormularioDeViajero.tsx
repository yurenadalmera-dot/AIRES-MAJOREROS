"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarViajero } from "@/lib/actions/viajeros";
import { TIPOS_DE_DOCUMENTO, SEXOS } from "@/lib/viajeros";
import { Aviso } from "@/components/ui";

/**
 * El formulario que rellena el huésped, uno por persona.
 *
 * Pensado para el móvil: campos grandes, una columna, y el teclado que toca
 * en cada uno. Al guardar se vacía para meter al siguiente, porque lo normal
 * es rellenar dos o cuatro seguidos.
 *
 * El número de soporte solo se pide para DNI y NIE: es el que va impreso al
 * lado del número y solo existe en los documentos españoles. Pedirlo a un
 * pasaporte alemán es pedir algo que no existe.
 */
export default function FormularioDeViajero({
  token,
  primero,
  entrada,
}: {
  token: string;
  /** El primero es el titular sin preguntar: alguien tiene que serlo. */
  primero: boolean;
  entrada: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [tipo, setTipo] = useState("NIF");
  const [clave, setClave] = useState(0);
  // Lo que había escrito, para devolverlo si el guardado falla.
  //
  // React vacía el formulario cuando termina una `action`, acierte o falle. Y
  // fallar es lo normal: un número de DNI mal copiado. Sin esto, el huésped
  // se encontraba el formulario en blanco con un mensaje de error, corregía el
  // documento, le daba al botón y no pasaba nada —porque el resto de campos
  // obligatorios estaban vacíos y el navegador bloqueaba el envío sin decir
  // nada. A esas alturas cualquiera manda una foto del DNI por WhatsApp.
  const [valores, setValores] = useState<Record<string, string>>({});
  const v = (campo: string) => valores[campo] ?? "";

  const espanol = tipo === "NIF" || tipo === "NIE";

  function handleSubmit(formData: FormData) {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const r = await guardarViajero(token, formData);
      if (r && typeof r === "object" && "error" in r) {
        setError(String(r.error));
        // Devolver lo escrito: corregir un campo no puede costar reescribirlo
        // todo. Se remonta el formulario con los valores de vuelta.
        const vuelta: Record<string, string> = {};
        formData.forEach((valor, campo) => {
          if (typeof valor === "string") vuelta[campo] = valor;
        });
        setValores(vuelta);
        setClave((k) => k + 1);
        return;
      }
      setGuardado(true);
      // Vaciar el formulario para el siguiente: se remonta entero.
      setValores({});
      setClave((k) => k + 1);
      router.refresh();
    });
  }

  return (
    <form key={clave} action={handleSubmit} className="card p-5 sm:p-6 space-y-4">
      <h2 className="text-[0.9375rem] font-semibold text-tinta">
        {primero ? "Tus datos" : "Añadir otra persona"}
      </h2>

      {error && <Aviso tono="mal">{error}</Aviso>}
      {guardado && !error && (
        <div className="rounded-xl border border-[#cfe6dd] bg-bien-suave px-3.5 py-3 text-sm text-bien">
          Guardado. Si viene alguien más, rellena sus datos abajo.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="v-nombre">
            Nombre *
          </label>
          <input id="v-nombre" name="nombre" required autoComplete="given-name" defaultValue={v("nombre")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="v-ap1">
            Primer apellido *
          </label>
          <input id="v-ap1" name="apellido1" required autoComplete="family-name" defaultValue={v("apellido1")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="v-ap2">
            Segundo apellido
          </label>
          <input id="v-ap2" name="apellido2" defaultValue={v("apellido2")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="v-nac">
            Fecha de nacimiento *
          </label>
          <input
            id="v-nac"
            name="fechaNacimiento"
            type="date"
            required
            max={entrada.slice(0, 10)}
            defaultValue={v("fechaNacimiento")}
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="v-tipo">
            Tipo de documento *
          </label>
          <select
            id="v-tipo"
            name="tipoDocumento"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="input"
          >
            {Object.entries(TIPOS_DE_DOCUMENTO).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="v-doc">
            Número del documento *
          </label>
          <input
            id="v-doc"
            name="documento"
            required
            autoCapitalize="characters"
            defaultValue={v("documento")}
            className="input"
          />
        </div>
        {espanol && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="v-sop">
              Número de soporte *
            </label>
            <input
              id="v-sop"
              name="numeroSoporte"
              autoCapitalize="characters"
              defaultValue={v("numeroSoporte")}
              className="input"
            />
            <p className="ayuda">
              No es el número del DNI: es el que va impreso justo al lado, y cambia cada vez que se
              renueva el documento.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="v-nacion">
            Nacionalidad *
          </label>
          <input
            id="v-nacion"
            name="nacionalidad"
            required
            defaultValue={v("nacionalidad") || "ESP"}
            autoCapitalize="characters"
            className="input"
          />
          <p className="ayuda">Tres letras: ESP, DEU, GBR…</p>
        </div>
        <div>
          <label className="label" htmlFor="v-sexo">
            Sexo
          </label>
          <select id="v-sexo" name="sexo" className="input" defaultValue={v("sexo")}>
            <option value="">Sin especificar</option>
            {Object.entries(SEXOS).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details
        className="rounded-lg border border-borde px-3 py-2"
        open={Boolean(v("direccion") || v("municipio") || v("telefono") || v("email"))}
      >
        <summary className="cursor-pointer text-sm text-tinta-suave">
          Dirección y contacto
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="v-dir">
              Dirección
            </label>
            <input id="v-dir" name="direccion" autoComplete="street-address" defaultValue={v("direccion")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="v-mun">
              Municipio
            </label>
            <input id="v-mun" name="municipio" defaultValue={v("municipio")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="v-prov">
              Provincia
            </label>
            <input id="v-prov" name="provincia" defaultValue={v("provincia")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="v-cp">
              Código postal
            </label>
            <input
              id="v-cp"
              name="codigoPostal"
              inputMode="numeric"
              defaultValue={v("codigoPostal")}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="v-pais">
              País
            </label>
            <input id="v-pais" name="pais" defaultValue={v("pais")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="v-tel">
              Teléfono
            </label>
            <input id="v-tel" name="telefono" type="tel" inputMode="tel" defaultValue={v("telefono")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="v-mail">
              Correo
            </label>
            <input
              id="v-mail"
              name="email"
              type="email"
              inputMode="email"
              defaultValue={v("email")}
              className="input"
            />
          </div>
        </div>
      </details>

      <div>
        <label className="label" htmlFor="v-par">
          Parentesco
        </label>
        <input id="v-par" name="parentesco" defaultValue={v("parentesco")} className="input" placeholder="Hijo, hija, cónyuge…" />
        <p className="ayuda">
          Obligatorio si esta persona es menor de edad: hay que decir quién responde por ella.
        </p>
      </div>

      {!primero && (
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" name="titular" className="h-4 w-4" />
          Esta persona es quien ha hecho la reserva
        </label>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Guardando…" : "Guardar esta persona"}
      </button>
    </form>
  );
}

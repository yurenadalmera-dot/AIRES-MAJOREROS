"use client";

import { useState } from "react";
import { IconoOjo, IconoOjoTachado } from "@/components/iconos";

/**
 * Un campo de contraseña que se puede mirar.
 *
 * Las contraseñas que genera la aplicación son catorce caracteres sin sentido,
 * y la que cada quien se pone tiene que tener diez. Escribirlas a ciegas, en un
 * móvil, es la forma más corta de acabar pidiendo que te la restablezcan: la
 * mitad de los «no me deja entrar» son una letra mal puesta que nadie pudo ver.
 *
 * El ojo lleva `type="button"`: un botón dentro de un formulario, sin eso, lo
 * envía, y «mostrar» acabaría intentando entrar con la contraseña a medias.
 */
export default function CampoContrasena({
  id,
  name,
  etiqueta,
  autoComplete,
  minLength,
  ayuda,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  /** Con el que viaja en el formulario. Si no se da, vale el `id`. */
  name?: string;
  etiqueta: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  ayuda?: string;
  /** Solo si el formulario lleva el valor en su estado; si no, va suelto. */
  value?: string;
  onChange?: (valor: string) => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const controlado = value !== undefined;

  return (
    <div>
      <label className="label" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name ?? id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          autoFocus={autoFocus}
          // Sin esto el móvil pone la primera en mayúscula y «corrige» la
          // contraseña en cuanto se enseña como texto normal.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="input pr-11"
          {...(controlado
            ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) }
            : {})}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
          aria-pressed={visible}
          title={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-tinta-suave hover:text-oceano-oscuro focus-visible:text-oceano-oscuro"
        >
          {visible ? <IconoOjoTachado size={18} /> : <IconoOjo size={18} />}
        </button>
      </div>
      {ayuda && <p className="text-xs text-tinta-suave mt-1">{ayuda}</p>}
    </div>
  );
}

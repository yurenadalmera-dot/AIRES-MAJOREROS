import type { Metadata } from "next";
import Link from "next/link";
import { usuarioDelEnlace } from "@/lib/recuperacion";
import { MarcaDoble } from "@/components/Marca";
import NuevaContrasenaConEnlace from "@/components/NuevaContrasenaConEnlace";

// El enlace es una llave y va en la dirección de la página. Sin esto, al
// pulsar cualquier enlace de salida el navegador le diría al otro sitio de
// qué dirección viene, llave incluida. Y que no la guarde ningún buscador.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Siempre al momento: un enlace que valía hace un minuto puede haberse usado.
export const dynamic = "force-dynamic";

/**
 * Adonde lleva el enlace del correo de «he olvidado mi contraseña».
 *
 * Es pública: no hay sesión, la autorización es el propio enlace —que caduca a
 * la media hora y sirve una vez—, como en el formulario de viajeros.
 */
export default async function RestablecerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const dueno = await usuarioDelEnlace(token);

  return (
    <div className="min-h-screen flex items-center justify-center bg-arena px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <MarcaDoble className="mb-8" />

        {dueno ? (
          <>
            <div className="text-center mb-5">
              <h1 className="serif text-[1.75rem] leading-tight text-marina">Contraseña nueva</h1>
              <p className="text-sm text-tinta-suave mt-1.5">
                Hola, {dueno.nombre}. Escribe la contraseña con la que quieres entrar a partir de
                ahora.
              </p>
            </div>
            <NuevaContrasenaConEnlace token={token} />
          </>
        ) : (
          // Un enlace que no existe, uno caducado y uno ya usado dan lo mismo
          // por fuera: decir cuál de los tres es le diría a quien prueba
          // enlaces cuándo ha acertado. Pero a diferencia de un 404 pelado,
          // aquí se dice qué hacer, porque lo normal es que haya caducado.
          <div className="card p-6 text-center">
            <h1 className="serif text-2xl text-marina">Este enlace ya no vale</h1>
            <p className="text-sm text-tinta-suave mt-2">
              Los enlaces para cambiar la contraseña caducan a la media hora y solo sirven una vez.
              Pide otro y te llegará un correo nuevo.
            </p>
            <Link href="/recuperar" className="btn-primary w-full mt-5">
              Pedir otro enlace
            </Link>
            <Link href="/login" className="enlace block text-sm mt-4">
              Volver a la pantalla de entrada
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

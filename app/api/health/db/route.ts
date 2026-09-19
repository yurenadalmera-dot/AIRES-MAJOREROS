import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Comprobación de estado de la conexión a la base de datos.
 *
 * Sirve para diagnosticar un despliegue sin tener que leer los logs del
 * servidor: responde si la aplicación llega a la base de datos y, cuando no,
 * con qué error exacto falla. Nunca devuelve credenciales — de la cadena
 * de conexión solo se extraen el host y el usuario, que es lo que hace
 * falta para distinguir un fallo de red de uno de autenticación.
 *
 * La cuenta se hace con el cliente de Prisma y no con SQL en crudo, para que
 * la comprobación no dependa del dialecto del motor.
 */
export async function GET() {
  const started = Date.now();

  // Host y usuario de DATABASE_URL, sin la contraseña.
  let target = "(DATABASE_URL no definida)";
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      target = `${parsed.username}@${parsed.hostname}:${parsed.port}`;
    } catch {
      target = "(DATABASE_URL con formato inválido)";
    }
  }

  try {
    const usuarios = await prisma.user.count();

    return NextResponse.json({
      ok: true,
      target,
      usuarios,
      authSecretPresente: Boolean(process.env.AUTH_SECRET),
      ms: Date.now() - started,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        target,
        authSecretPresente: Boolean(process.env.AUTH_SECRET),
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - started,
      },
      { status: 500 }
    );
  }
}

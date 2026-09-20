import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Comprobación de estado de la conexión a la base de datos.
 *
 * Sirve para diagnosticar un despliegue en el que todavía no puede entrar
 * nadie: si el login no funciona, esta ruta dice si el problema es la base de
 * datos o es otra cosa. Por eso es pública — exigir sesión la haría inútil
 * justo cuando hace falta.
 *
 * Pero pública no quiere decir habladora. Sin sesión responde lo mínimo: si
 * conecta o no, y una causa aproximada. El usuario y el servidor de la base de
 * datos, y cuánta gente hay dada de alta, solo se ven con la sesión iniciada.
 * Antes los publicaba a cualquiera que abriera la dirección.
 */

/** Causa aproximada, sin decir contra qué servidor ni con qué usuario. */
function causaAproximada(mensaje: string): string {
  if (/Authentication failed|Access denied/i.test(mensaje)) {
    return "la base de datos rechaza las credenciales (revisa que el host sea localhost)";
  }
  if (/Can't reach|ECONNREFUSED|ETIMEDOUT|timed out/i.test(mensaje)) {
    return "no se alcanza el servidor de base de datos";
  }
  if (/Unknown database|doesn't exist/i.test(mensaje)) {
    return "la base de datos indicada no existe";
  }
  return "error al consultar la base de datos";
}

export async function GET() {
  const started = Date.now();
  const session = await getSession();

  try {
    const usuarios = await prisma.user.count();

    if (!session) {
      return NextResponse.json({ ok: true, ms: Date.now() - started });
    }

    // Host y usuario de DATABASE_URL, nunca la contraseña.
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

    return NextResponse.json({
      ok: true,
      target,
      usuarios,
      authSecretPresente: Boolean(process.env.AUTH_SECRET),
      ms: Date.now() - started,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        ok: false,
        causa: causaAproximada(mensaje),
        // El error de Prisma trae host y usuario, así que solo con sesión.
        ...(session ? { error: mensaje, authSecretPresente: Boolean(process.env.AUTH_SECRET) } : {}),
        ms: Date.now() - started,
      },
      { status: 500 }
    );
  }
}

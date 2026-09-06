import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, DemoSeedMissingError } from "@/lib/prisma";
import { createSessionToken, setSessionCookie, MissingAuthSecretError } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { z } from "zod";

// Prisma necesita el runtime de Node (no Edge) y no debe cachearse.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const BAD_CREDENTIALS = "Credenciales incorrectas";

/**
 * Traduce un fallo de configuración del despliegue a un mensaje accionable.
 *
 * Sin esto cualquier excepción del servidor acababa como un 500 con cuerpo HTML,
 * y el formulario de login solo podía enseñar su mensaje genérico
 * ("No se pudo iniciar sesión"), indistinguible de una contraseña mal escrita.
 */
function configurationError(error: unknown): string | null {
  if (error instanceof MissingAuthSecretError) {
    return "El servidor no tiene configurada la variable AUTH_SECRET. Defínela en el entorno del despliegue.";
  }
  if (error instanceof DemoSeedMissingError) {
    return "Faltan los datos de demostración en el despliegue (prisma/preview-seed.db). Vuelve a desplegar ejecutando 'npm run build'.";
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Environment variable not found: DATABASE_URL")) {
    return "El servidor no tiene configurada la variable DATABASE_URL y el modo demo está desactivado.";
  }
  if (/does not exist in the current database|Unable to open the database file|P1003|P2021/i.test(message)) {
    return isDemoMode()
      ? "La base de datos de demostración no se pudo abrir en el servidor."
      : "La base de datos del servidor no está inicializada (faltan las tablas). Ejecuta las migraciones y la carga de datos.";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) {
      return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user.id,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    await setSessionCookie(token);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // El detalle completo queda en los logs del servidor; al navegador solo va
    // el motivo, sin trazas ni valores de configuración.
    console.error("[auth/login] fallo al procesar el inicio de sesión:", error);
    const detail = configurationError(error);
    return NextResponse.json(
      {
        error: detail
          ? `No se pudo iniciar sesión. ${detail}`
          : "No se pudo iniciar sesión por un error del servidor. Revisa los registros del despliegue.",
      },
      { status: 500 }
    );
  }
}

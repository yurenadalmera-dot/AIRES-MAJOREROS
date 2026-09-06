import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasAuthSecret } from "@/lib/auth";
import { isDemoMode, hasServerDatabase } from "@/lib/demo-mode";

// Consulta a base de datos: runtime de Node y sin caché.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico del despliegue, pensado para comprobar desde el navegador por qué
 * falla el inicio de sesión en un servidor propio (Hostinger, VPS...).
 *
 * Solo devuelve indicadores de si cada pieza está configurada y si la base de
 * datos responde: nunca el valor de una variable de entorno ni datos de usuario.
 */
export async function GET() {
  const demo = isDemoMode();
  const authSecretConfigured =
    typeof process.env.AUTH_SECRET === "string" && process.env.AUTH_SECRET.trim() !== "";

  let database: { ok: boolean; users?: number; error?: string };
  try {
    const users = await prisma.user.count({ where: { active: true } });
    database = { ok: true, users };
  } catch (error) {
    console.error("[health] la base de datos no responde:", error);
    // Solo la línea que explica la causa (Prisma la deja al final del mensaje);
    // evita volcar la traza completa en una respuesta pública.
    const message = error instanceof Error ? error.message : String(error);
    const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
    database = { ok: false, error: lines[lines.length - 1] ?? "error desconocido" };
  }

  const canLogIn = database.ok && (database.users ?? 0) > 0 && (authSecretConfigured || demo);

  return NextResponse.json(
    {
      ok: canLogIn,
      demoMode: demo,
      env: {
        AUTH_SECRET: authSecretConfigured ? "configurada" : "sin configurar",
        DATABASE_URL: hasServerDatabase()
          ? "configurada (motor de servidor)"
          : process.env.DATABASE_URL
            ? "configurada (SQLite)"
            : "sin configurar",
        NODE_ENV: process.env.NODE_ENV ?? "sin definir",
      },
      database,
      // Sin secreto no se puede firmar la cookie: el login devolvería un error
      // aunque las credenciales fueran correctas.
      sessionSecret: authSecretConfigured
        ? "configurada"
        : demo
          ? "usando el secreto de respaldo del modo demo"
          : "FALTA: define AUTH_SECRET en el entorno del servidor",
    },
    { status: canLogIn ? 200 : 503 }
  );
}

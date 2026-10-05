import { prisma } from "@/lib/prisma";
import { entregarPendientes } from "@/lib/recuperacion";
import { tokenCoincide, tokenDeLaCabecera } from "@/lib/token-importacion";

/**
 * Los correos de «he olvidado mi contraseña» que hay que mandar ahora.
 *
 * El SaaS sabe quién lo ha pedido y le genera el enlace; lo que no tiene es
 * por dónde sacar un correo. Eso lo hace n8n, que pasa por aquí cada minuto.
 * Mismo reparto que con los informes y el correo de llegada.
 *
 * Es `POST` y no `GET` porque **cambia cosas**: cada petición que devuelve
 * queda marcada como entregada y no vuelve a salir. Un `GET` lo puede repetir
 * cualquier intermediario sin preguntar, y aquí repetir es perder el correo.
 *
 * Lo que sale por aquí son llaves: enlaces que abren una cuenta. Por eso va
 * con el mismo token que las demás rutas de n8n, y por eso quien lo recoja no
 * debe guardarlo en ningún sitio más que en el correo que manda.
 *
 *   POST /api/recuperaciones
 *   Authorization: Bearer imp_…
 */

async function organizacionDelToken(request: Request): Promise<string | Response> {
  const token = tokenDeLaCabecera(request.headers.get("authorization"));
  if (!token) {
    return Response.json(
      { error: "Falta la cabecera Authorization con «Bearer imp_…»." },
      { status: 401 }
    );
  }
  const ajustes = await prisma.integrationSettings.findFirst({
    where: { provider: "IMPORT" },
    select: { organizationId: true, apiKeyCifrada: true },
  });
  if (!ajustes) {
    return Response.json(
      { error: "No hay ningún token generado. Genéralo en Ajustes." },
      { status: 401 }
    );
  }
  if (!tokenCoincide(token, ajustes.apiKeyCifrada)) {
    return Response.json({ error: "Ese token no es el que hay guardado." }, { status: 401 });
  }
  return ajustes.organizationId;
}

export async function POST(request: Request) {
  const org = await organizacionDelToken(request);
  if (typeof org !== "string") return org;

  const correos = await entregarPendientes(org);

  return Response.json(
    { ok: true, correos },
    // Que nadie por el camino se quede una copia de los enlaces.
    { headers: { "Cache-Control": "no-store" } }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pedirRecuperacion } from "@/lib/recuperacion";

const schema = z.object({ email: z.string().email() });

// Delante de la aplicación está la CDN del hosting, que a una respuesta sin
// `Cache-Control` le pone por su cuenta «público, tres días». Aquí no hay nada
// que guardar, y menos una respuesta que depende de quién pregunta.
const SIN_CACHE = { "Cache-Control": "no-store" };

/**
 * Pedir el enlace de «he olvidado mi contraseña».
 *
 * Pública, porque quien la llama es justo quien no puede entrar.
 *
 * Contesta **lo mismo** haya o no una cuenta con ese correo, esté activa o
 * no, y haya o no llegado al tope de peticiones de la hora: cualquier
 * diferencia en la respuesta es una pista sobre quién tiene cuenta aquí.
 *
 * Aquí no se manda ningún correo ni se genera ningún enlace: solo queda
 * apuntado. Lo recoge n8n en `/api/recuperaciones`.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Esto sí se dice: es un correo mal escrito, no una cuenta que no existe.
    return NextResponse.json(
      { error: "Ese correo no parece válido." },
      { status: 400, headers: SIN_CACHE }
    );
  }

  await pedirRecuperacion(parsed.data.email);
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}

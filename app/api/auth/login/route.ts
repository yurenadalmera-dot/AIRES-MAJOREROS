import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { primeraRutaPermitida } from "@/lib/business-context";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  await setSessionCookie(token);

  // Dónde empieza cada quien: mandar a una socia al panel de alquiler,
  // donde casi nada le compete, es desconcertante.
  //
  // `debeCambiar` es solo para que la pantalla de entrada la lleve derecha a
  // «Mi cuenta». No es lo que la obliga: eso lo hace el servidor en cada
  // pantalla y en cada acción, mirando la base de datos.
  return NextResponse.json({
    ok: true,
    inicio: primeraRutaPermitida(user.role),
    debeCambiar: user.mustChangePassword,
  });
}

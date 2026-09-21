import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// `/api/health/db` es pública a propósito: sirve para diagnosticar un
// despliegue que todavía no deja entrar a nadie, así que exigir sesión la
// haría inútil. No expone datos: solo si hay conexión a la base de datos.
// `/api/importar` no lleva sesión de navegador porque quien llama es un
// workflow de n8n: se autentica con su propio token de escritura, que la
// propia ruta comprueba. Dejarlo fuera del middleware no lo abre.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health/db", "/api/importar"];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // El logotipo y el icono de la pestaña: se ven en la pantalla de entrada,
    // antes de que haya sesión. Sin esto, el middleware los manda a /login y
    // la portada sale con la imagen rota.
    pathname.startsWith("/marca/") ||
    pathname.startsWith("/icon")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get("session")?.value;
  const secret = process.env.AUTH_SECRET;

  let valid = false;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

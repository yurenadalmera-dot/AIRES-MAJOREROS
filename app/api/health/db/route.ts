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

/**
 * Cuándo se compiló lo que está corriendo. Lo inyecta `next.config.mjs`.
 *
 * Es lo que permite distinguir «el sitio responde» de «el sitio responde con
 * la versión nueva»: un despliegue que falla deja la anterior en pie, y sin
 * este dato nada lo delata.
 */
const COMPILADO_EN = process.env.COMPILADO_EN ?? "desconocido";

/** ¿Es el error de pedirle a la base una columna o una tabla que no tiene? */
function faltaAlgoDelEsquema(mensaje: string): boolean {
  return /P2021|P2022|does not exist in the current database|Unknown column/i.test(mensaje);
}

/**
 * ¿Tiene la base la forma que espera este código?
 *
 * Contar usuarios no lo dice: `COUNT(*)` funciona igual falte la columna que
 * falte. Y es justo el fallo que deja a todo el mundo fuera sin que nada lo
 * delate: el código nuevo pide al entrar una columna que la base todavía no
 * tiene, el login contesta un error y esta ruta seguía diciendo «todo bien».
 *
 * Se pide aquí la última columna añadida. Si un día se añade otra de la que
 * dependa entrar, se cambia por esa.
 */
async function comprobarEsquema() {
  await prisma.user.findFirst({ select: { mustChangePassword: true } });
}

/** Causa aproximada, sin decir contra qué servidor ni con qué usuario. */
function causaAproximada(mensaje: string): string {
  if (faltaAlgoDelEsquema(mensaje)) {
    return "a la base de datos le falta un cambio de esquema que este código necesita (no se aplicó al arrancar): reinicia la aplicación";
  }
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

  // Dentro de su propio `try`: si a la base le falta una columna, mirar la
  // sesión falla también, y antes eso tumbaba esta ruta con un error sin
  // cuerpo en vez de dejarla decir qué pasa. Sin sesión se sigue, callando
  // lo que solo se enseña con ella.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  try {
    const usuarios = await prisma.user.count();

    try {
      await comprobarEsquema();
    } catch (error) {
      if (!faltaAlgoDelEsquema(error instanceof Error ? error.message : String(error))) throw error;
      // Los cambios de esquema se aplican al arrancar, y si la base no
      // contestó en ese momento se quedaron sin aplicar hasta el siguiente
      // reinicio. Se reintentan aquí —cada uno mira antes si hace falta, así
      // que repetirlos no rompe nada— y se vuelve a comprobar: si siguen sin
      // estar, esta ruta lo dice.
      const { aplicarMigraciones } = await import("@/lib/migraciones");
      await aplicarMigraciones();
      await comprobarEsquema();
    }

    if (!session) {
      return NextResponse.json({ ok: true, compilado: COMPILADO_EN, ms: Date.now() - started });
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
      compilado: COMPILADO_EN,
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

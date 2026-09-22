import { prisma } from "@/lib/prisma";
import { llegadasProximas, listaParaEscribir } from "@/lib/llegada";
import { tokenCoincide, tokenDeLaCabecera } from "@/lib/token-importacion";

/**
 * Quién entra pronto y qué hay que contarle, para que alguien lo mande.
 *
 * El SaaS sabe quién llega y a qué casa; lo que no tiene es por dónde sacar un
 * correo. Eso lo hace n8n. Mismo reparto que con los informes.
 *
 * **El código de la caja de llaves no sale por aquí.** Está guardado y
 * cifrado, pero esto solo dice si lo hay (`tieneCodigoDeLlave`). Un correo se
 * queda para siempre en el buzón de mucha gente y ese código no cambia entre
 * un huésped y el siguiente: se manda aparte, el día de la entrada y por un
 * canal que caduque.
 *
 * Las viviendas incompletas salen igual, con `falta`, en vez de
 * desaparecer del listado: una lista que solo enseña lo que ya está listo
 * esconde justo el trabajo que queda.
 *
 *   GET /api/llegadas?dias=7
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

export async function GET(request: Request) {
  const org = await organizacionDelToken(request);
  if (typeof org !== "string") return org;

  const url = new URL(request.url);
  const dias = Math.min(30, Math.max(1, Number(url.searchParams.get("dias") ?? "7") || 7));

  const llegadas = await llegadasProximas({ organizationId: org, dias });

  return Response.json({
    ok: true,
    dias,
    // Separadas a propósito: lo que se puede mandar y lo que hay que
    // completar antes. Mezclarlas obliga a filtrar fuera y, en la práctica,
    // a que nadie lo haga.
    listas: llegadas.filter(listaParaEscribir).map(aJson),
    incompletas: llegadas.filter((l) => !listaParaEscribir(l)).map(aJson),
  });
}

function aJson(l: Awaited<ReturnType<typeof llegadasProximas>>[number]) {
  return {
    bookingId: l.bookingId,
    huesped: l.huesped,
    entrada: l.entrada.toISOString().slice(0, 10),
    salida: l.salida.toISOString().slice(0, 10),
    diasHastaLaEntrada: l.diasHastaLaEntrada,
    vivienda: l.vivienda,
    tieneCodigoDeLlave: l.tieneCodigoDeLlave,
    falta: l.falta.map((f) => f.etiqueta),
  };
}

import { prisma } from "@/lib/prisma";
import { sincronizarLodgify } from "@/lib/actions/lodgify-sync";
import { tokenCoincide, tokenDeLaCabecera } from "@/lib/token-importacion";

/**
 * La sincronización con Lodgify, para que pueda correr sola.
 *
 * Hasta ahora esta sincronización tenía un único disparador: un botón en
 * Ajustes. Es decir, las reservas entraban **solo cuando alguien se acordaba
 * de pulsarlo**. Lo automático lo hacían dos workflows que volcaban en
 * Airtable y en Supabase, y esos se han apagado: el SaaS es ahora el único
 * sitio donde viven los datos, así que tiene que traerlos él.
 *
 * Se autentica con el mismo token de escritura que `/api/importar`, que se
 * genera en Ajustes y del que aquí solo se guarda la huella. No lleva sesión
 * de navegador porque quien llama es un programador de tareas, no una persona.
 *
 * Es idempotente —cada reserva se reconoce por su `lodgifyBookingId`— así que
 * se puede llamar cada hora sin duplicar nada.
 */
export async function POST(request: Request) {
  const cabecera = request.headers.get("authorization");
  const token = tokenDeLaCabecera(cabecera);
  if (!token) {
    const empiezaPor = cabecera?.trim().split(/\s+/)[0]?.slice(0, 16);
    return Response.json(
      {
        error: cabecera
          ? `La cabecera Authorization llega, pero empieza por «${empiezaPor}» y tiene que empezar por «Bearer ».`
          : "No llega ninguna cabecera Authorization.",
      },
      { status: 401 }
    );
  }

  const ajustes = await prisma.integrationSettings.findFirst({
    where: { provider: "IMPORT" },
    select: { organizationId: true, apiKeyCifrada: true },
  });
  if (!ajustes) {
    return Response.json(
      { error: "Aquí no hay ningún token generado todavía. Genéralo en Ajustes." },
      { status: 401 }
    );
  }
  if (!tokenCoincide(token, ajustes.apiKeyCifrada)) {
    return Response.json({ error: "Ese token no es el que hay guardado." }, { status: 401 });
  }

  try {
    const resumen = await sincronizarLodgify(ajustes.organizationId);
    return Response.json({ ok: true, ...resumen });
  } catch (error) {
    // Una tarea programada no tiene a nadie mirando la pantalla: el motivo
    // tiene que salir en la respuesta y en los registros del servidor.
    const motivo = error instanceof Error ? error.message : String(error);
    console.error("Sincronización programada con Lodgify fallida:", motivo);
    return Response.json({ ok: false, error: motivo }, { status: 502 });
  }
}

import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/auth";

/**
 * Sirve el original de una factura subida.
 *
 * Revisar sin poder ver el papel obliga a fiarse, que es justo lo que no se
 * quiere: el botón que abre el documento no es un adorno.
 *
 * Va por la organización de la sesión, no por el id a secas: con el id
 * suelto, cualquiera con sesión en otra organización podría pedir facturas
 * ajenas.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = await exigir("operativa.alquiler");
  const { id } = await params;

  const documento = await prisma.documentoOcr.findFirst({
    where: { id, organizationId },
    select: { contenido: true, archivoMime: true, archivoNombre: true },
  });
  if (!documento) return new Response("No existe", { status: 404 });

  return new Response(new Uint8Array(documento.contenido), {
    headers: {
      "Content-Type": documento.archivoMime,
      // `inline`: lo normal es querer mirarlo, no descargarlo.
      "Content-Disposition": `inline; filename="${encodeURIComponent(documento.archivoNombre)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

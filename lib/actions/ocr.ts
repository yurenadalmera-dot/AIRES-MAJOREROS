"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir, getSession } from "@/lib/auth";
import { descifrar } from "@/lib/secretos";
import { leerFactura, ErrorDeLectura, MAX_BYTES, admitido, motivoNoAdmitido } from "@/lib/ocr/llamada";
import { revisarFactura, type FacturaRevisada } from "@/lib/ocr/validacion";
import { leerFechas } from "@/lib/fechas";
import { leerImporte } from "@/lib/money";

/**
 * Cuántas facturas se pueden leer al mes.
 *
 * Se comprueba **antes** de llamar al modelo: después ya se ha pagado. Es lo
 * único que impide que una sesión válida dispare la factura de la API
 * subiendo mil fotos, por error o por prisa.
 */
const CUPO_MENSUAL = Number(process.env.OCR_CUPO_MENSUAL || 300);

async function claveDeLectura(organizationId: string): Promise<string | null> {
  const ajustes = await prisma.integrationSettings.findUnique({
    where: { organizationId_provider: { organizationId, provider: "OCR" } },
    select: { apiKeyCifrada: true },
  });
  return descifrar(ajustes?.apiKeyCifrada) ?? process.env.ANTHROPIC_API_KEY ?? null;
}

/** Cuántas lecturas van este mes. Cuenta intentos, no altas. */
async function lecturasDelMes(organizationId: string): Promise<number> {
  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  return prisma.documentoOcr.count({ where: { organizationId, createdAt: { gte: desde } } });
}

export interface LecturaDevuelta {
  id: string;
  revision: FacturaRevisada;
  /** Aviso de que el mismo archivo ya se había subido antes. */
  duplicadoDe?: string;
  /** Cuando no se ha podido leer: el archivo está guardado igual. */
  errorLectura?: string;
  restantes: number;
}

/**
 * Sube una factura de gasto y la lee.
 *
 * El orden importa y no es casual:
 *
 *   1. Permiso, antes que nada.
 *   2. Tipo y tamaño del archivo.
 *   3. **Cupo, antes de llamar al modelo** — después ya se ha pagado.
 *   4. **Guardar el original, siempre** — aunque la lectura falle después.
 *      El justificante es lo que hace falta el día que haya una comprobación.
 *   5. Llamar al modelo y verificar en código lo que conteste.
 *
 * Lo leído **no se guarda como gasto**: queda pendiente de que una persona lo
 * confirme. Ver `confirmarFactura`.
 */
export async function subirFactura(formData: FormData) {
  return conErroresLegibles<LecturaDevuelta>(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const sesion = await getSession();

    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new ErrorDeNegocio("Elige un archivo.");
    }
    if (archivo.size > MAX_BYTES) {
      throw new ErrorDeNegocio(
        `El archivo pesa ${(archivo.size / 1048576).toFixed(1)} MB y el máximo son 10 MB.`
      );
    }

    const bytes = Buffer.from(await archivo.arrayBuffer());
    const hash = createHash("sha256").update(bytes).digest("hex");
    const mime = archivo.type || "application/octet-stream";

    // El mismo documento subido dos veces: se avisa antes de gastar una
    // lectura. No se bloquea — hay casos legítimos— pero que se vea.
    const yaEstaba = await prisma.documentoOcr.findFirst({
      where: { organizationId, archivoHash: hash },
      select: { id: true, estado: true },
      orderBy: { createdAt: "desc" },
    });

    const usadas = await lecturasDelMes(organizationId);
    const conCupo = usadas < CUPO_MENSUAL;
    const sePuedeLeer = admitido(mime) && conCupo && !yaEstaba;

    // ── El original se guarda SIEMPRE ───────────────────────────────
    // Aunque no se pueda leer, aunque no haya cupo, aunque falle la API.
    // Perder el justificante por un formato o por una cuota es un fallo
    // caro y evitable.
    const documento = await prisma.documentoOcr.create({
      data: {
        organizationId,
        subidoPorId: sesion?.userId ?? null,
        archivoNombre: archivo.name || "factura",
        archivoMime: mime,
        archivoBytes: bytes.length,
        archivoHash: hash,
        contenido: bytes,
      },
      select: { id: true },
    });

    let errorLectura: string | undefined;
    let datos: unknown = null;

    if (!admitido(mime)) {
      errorLectura = motivoNoAdmitido(mime);
    } else if (!conCupo) {
      errorLectura =
        `Se han leído ya ${usadas} facturas este mes, que es el máximo. El archivo se ha ` +
        "guardado: rellena los datos a mano.";
    } else if (yaEstaba) {
      errorLectura =
        "Este archivo ya se había subido antes, así que no se ha vuelto a leer. " +
        "Míralo en la bandeja por si ya está registrado.";
    } else {
      const apiKey = await claveDeLectura(organizationId);
      if (!apiKey) {
        errorLectura =
          "No hay clave de lectura de facturas configurada. Ponla en Ajustes; mientras " +
          "tanto, rellena los datos a mano.";
      } else {
        // El catálogo, para que no invente un proveedor nuevo por cada
        // forma de escribir «Endesa».
        const [proveedores, viviendas] = await Promise.all([
          prisma.expense.findMany({
            where: { organizationId, supplier: { not: null } },
            select: { supplier: true },
            distinct: ["supplier"],
            take: 50,
          }),
          prisma.property.findMany({
            where: { organizationId, active: true },
            select: { id: true, name: true, address: true },
            take: 60,
          }),
        ]);

        try {
          const r = await leerFactura({
            bytes,
            mime,
            apiKey,
            // Los proveedores se identifican por su propio nombre: aquí no
            // hay tabla de terceros todavía.
            proveedores: proveedores
              .map((p) => p.supplier!)
              .filter(Boolean)
              .map((n) => ({ id: n, nombre: n })),
            viviendas: viviendas.map((v) => ({
              id: v.id,
              nombre: v.address ? `${v.name} — ${v.address}` : v.name,
            })),
          });
          datos = r.datos;
          await prisma.documentoOcr.update({
            where: { id: documento.id },
            data: {
              // Literal y sin tocar: es la única referencia que hay para
              // medir después si el modelo acierta.
              datosIa: JSON.stringify(r.datos),
              modelo: r.uso.modelo,
              promptVersion: r.uso.promptVersion,
              tokensEntrada: r.uso.tokensEntrada,
              tokensSalida: r.uso.tokensSalida,
              tokensCache: r.uso.tokensCache,
            },
          });
        } catch (e) {
          errorLectura =
            e instanceof ErrorDeLectura
              ? e.message
              : "No se ha podido leer el documento. El archivo se ha guardado: rellena los datos a mano.";
        }
      }
    }

    const viviendasDeLaOrg = await prisma.property.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const revision = revisarFactura(datos, {
      viviendas: viviendasDeLaOrg.map((v) => v.id),
    });

    await prisma.documentoOcr.update({
      where: { id: documento.id },
      data: {
        confianzaIa: revision.confianza,
        fiabilidad: revision.fiabilidad,
        motivos: JSON.stringify(revision.motivos),
        avisos: JSON.stringify(revision.avisos),
        errorLectura: errorLectura ?? null,
      },
    });

    revalidatePath("/rental/gastos");
    return {
      id: documento.id,
      revision,
      ...(yaEstaba ? { duplicadoDe: yaEstaba.id } : {}),
      ...(errorLectura ? { errorLectura } : {}),
      restantes: Math.max(0, CUPO_MENSUAL - usadas - (sePuedeLeer ? 1 : 0)),
    };
  });
}

/**
 * Registra el gasto a partir de una factura revisada.
 *
 * Todo en una transacción: un alta a medias —el gasto creado, el documento
 * sin marcar— deja basura que alguien tiene que limpiar a mano, y
 * normalmente se descubre semanas después.
 *
 * Lo que se guarda es **lo que ha confirmado la persona**, no lo que dijo el
 * modelo. Y se guarda aunque no haya cambiado nada: «alguien miró esto y lo
 * dio por bueno» es justo el dato que dice si el modelo acierta.
 */
export async function confirmarFactura(id: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const sesion = await getSession();

    const documento = await prisma.documentoOcr.findFirst({
      where: { id, organizationId },
      select: { id: true, estado: true },
    });
    if (!documento) throw new ErrorDeNegocio("Esa factura no existe.");
    if (documento.estado === "registrado") {
      throw new ErrorDeNegocio("Esta factura ya se registró como gasto.");
    }

    const propertyId = String(formData.get("propertyId") ?? "").trim();
    const concept = String(formData.get("concept") ?? "").trim();
    const supplier = String(formData.get("supplier") ?? "").trim();
    const importe = leerImporte(String(formData.get("amount") ?? ""));

    if (!propertyId) throw new ErrorDeNegocio("Falta la vivienda.");
    if (!concept) throw new ErrorDeNegocio("Falta el concepto.");
    if (importe === null || importe <= 0) {
      throw new ErrorDeNegocio("El importe tiene que ser un número mayor que cero.");
    }

    const { fechas, invalidas } = leerFechas(String(formData.get("date") ?? ""));
    if (fechas.length === 0) {
      throw new ErrorDeNegocio(
        invalidas.length > 0 ? `No entiendo la fecha «${invalidas[0]}».` : "Falta la fecha."
      );
    }

    const vivienda = await prisma.property.findFirst({
      where: { id: propertyId, organizationId },
      select: { id: true, ownerId: true },
    });
    if (!vivienda) throw new ErrorDeNegocio("Esa vivienda no existe.");

    const revisado = {
      fecha: fechas[0].toISOString().slice(0, 10),
      concepto: concept,
      proveedor: supplier || null,
      importe,
      propertyId: vivienda.id,
    };

    await prisma.$transaction(async (tx) => {
      const gasto = await tx.expense.create({
        data: {
          organizationId,
          propertyId: vivienda.id,
          ownerId: vivienda.ownerId,
          date: fechas[0],
          concept,
          supplier: supplier || null,
          amount: importe,
          notes: `Leída de una factura subida. Documento ${documento.id}.`,
        },
        select: { id: true },
      });

      await tx.documentoOcr.update({
        where: { id: documento.id },
        data: {
          estado: "registrado",
          expenseId: gasto.id,
          datosRevisados: JSON.stringify(revisado),
          revisadoPorId: sesion?.userId ?? null,
          revisadoEn: new Date(),
        },
      });
    });

    revalidatePath("/rental/gastos");
    revalidatePath("/rental/reports");
  });
}

/** Descarta una factura sin registrarla. El archivo se conserva. */
export async function descartarFactura(id: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const sesion = await getSession();
    await prisma.documentoOcr.updateMany({
      where: { id, organizationId, estado: "pendiente" },
      data: { estado: "descartado", revisadoPorId: sesion?.userId ?? null, revisadoEn: new Date() },
    });
    revalidatePath("/rental/gastos");
  });
}

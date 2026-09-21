"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { splitAmount, round2, calcularImpuesto } from "@/lib/money";
import { format } from "date-fns";
import { INVOICE_STATUS_LABEL, puedeCambiarEstadoFactura, BUSINESS_TYPES } from "@/lib/constants";
import { numeroSiguiente, prefijoFacturas, prefijoResumenes } from "@/lib/numeracion";

/**
 * Lo que se lee en cada línea de la factura.
 *
 * Es la misma frase que venía imprimiendo el workflow de n8n —«Limpieza de
 * salida (4 huéspedes)»— porque quien recibe la factura tiene que poder
 * comprobar por qué cuesta lo que cuesta: la tarifa cobra por huésped.
 *
 * No se exporta a propósito: este fichero es "use server" y ahí solo pueden
 * salir funciones asíncronas.
 */
function descripcionDeLinea(t: {
  type: string;
  servicio: string | null;
  huespedes: number | null;
}): string {
  if (t.type !== "CLEANING") return "Servicio";
  if (t.servicio === "repaso") return "Limpieza de repaso";
  return t.huespedes !== null
    ? `Limpieza de salida (${t.huespedes} ${t.huespedes === 1 ? "huésped" : "huéspedes"})`
    : "Limpieza de salida";
}

/** Solo para los mensajes de error: dd/mm/aaaa. */
function formatDate(fecha: Date): string {
  return format(fecha, "dd/MM/yyyy");
}

const generateSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Siguiente número del año para una serie, `<PREFIJO>AAAA-NNNN`.
 *
 * Se deriva del número más alto ya emitido, no de cuántos documentos hay: si
 * se anula uno, contar da un número que ya existe y, como `invoiceNumber` es
 * único, el siguiente no se puede emitir. Además la numeración debe ser
 * correlativa y no reutilizar números, aunque haya huecos por anulación.
 *
 * Facturas y resúmenes llevan **series distintas**. Un resumen no es una
 * factura y no puede gastar un número de la serie fiscal: si lo hiciera, la
 * serie de facturas quedaría con huecos que no corresponden a nada.
 */
async function siguienteNumero(organizationId: string, tipo: "FACTURA" | "RESUMEN") {
  const prefijo = tipo === "RESUMEN" ? prefijoResumenes() : prefijoFacturas();

  const ultima = await prisma.invoice.findFirst({
    where: { organizationId, invoiceNumber: { startsWith: prefijo } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  return numeroSiguiente(prefijo, ultima?.invoiceNumber ?? null);
}

export interface ResumenDeFacturacion {
  /** Documentos creados, en orden. */
  creados: { id: string; numero: string; propietario: string; tipo: string; total: number }[];
  /** Lo que no se ha podido facturar, y por qué. Sin esto se perdería. */
  pendientes: string[];
}

/**
 * Emite los documentos de un periodo, **uno por propietario**.
 *
 * Los clientes de Aires Majoreros son los propietarios de las viviendas, no
 * el negocio de alquiler: cada uno recibe lo suyo, con el detalle de sus
 * viviendas. Antes esto metía todas las limpiezas del periodo en una sola
 * factura a nombre del negocio de alquiler, que es exactamente lo contrario.
 *
 * Y no todos reciben factura: `Owner.documentoLimpieza` decide si se le emite
 * una factura con IGIC o solo un resumen informativo.
 *
 * Las limpiezas que no se pueden facturar no se pierden ni se cuelan: se
 * quedan pendientes y salen nombradas en el parte.
 */
export async function generarFacturasDelPeriodo(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("facturacion");
    const data = generateSchema.parse(Object.fromEntries(formData.entries()));

    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    periodEnd.setHours(23, 59, 59, 999);

    const pendientes = await prisma.cleaningTask.findMany({
      where: {
        organizationId,
        type: "CLEANING",
        billable: true,
        status: "DONE",
        invoiceId: null,
        date: { gte: periodStart, lte: periodEnd },
      },
      include: { property: { include: { owner: true } } },
      orderBy: { date: "asc" },
    });

    if (pendientes.length === 0) {
      throw new ErrorDeNegocio("No hay limpiezas pendientes de facturar en ese periodo.");
    }

    // Una limpieza a 0 € no se puede cobrar, y emitida ya no hay marcha atrás:
    // una factura emitida solo se corrige con una rectificativa. Así que se
    // para aquí y se dice cuáles son, en vez de sumar ceros dentro de un
    // documento con efectos fiscales.
    const sinPrecio = pendientes.filter((t) => Number(t.price) === 0);
    if (sinPrecio.length > 0) {
      const cuales = sinPrecio
        .slice(0, 5)
        .map((t) => `${t.property.name} (${formatDate(t.date)})`)
        .join(", ");
      throw new ErrorDeNegocio(
        `Hay ${sinPrecio.length} limpieza(s) sin precio en ese periodo y no se pueden facturar: ` +
          `${cuales}${sinPrecio.length > 5 ? "…" : ""}. ` +
          "Ponles precio en el tablero de limpiezas, o asígnale una tarifa al propietario."
      );
    }

    // El impuesto se copia del negocio al documento en el momento de emitirlo.
    // Aquí es IGIC, no IVA: en Canarias el tipo general es el 7 %. Copiarlo (en
    // lugar de leerlo al mostrar la factura) es lo que hace que cambiar el tipo
    // el año que viene no altere ni un céntimo de las ya emitidas.
    const negocio = await prisma.business.findFirst({
      where: { organizationId, type: BUSINESS_TYPES.CLEANING_BILLING },
      select: { taxRate: true },
    });
    const tipoImpositivo = negocio ? Number(negocio.taxRate) : 7;

    const splitConfig = await prisma.partnerSplitConfig.findFirst({
      where: { organizationId },
      orderBy: { effectiveFrom: "desc" },
    });
    const partnerAPercent = splitConfig ? Number(splitConfig.partnerAPercent) : 50;
    const partnerBPercent = splitConfig ? Number(splitConfig.partnerBPercent) : 50;

    // Agrupadas por propietario, conservando el orden por fecha.
    const porPropietario = new Map<string, typeof pendientes>();
    const avisos: string[] = [];
    for (const t of pendientes) {
      const owner = t.property.owner;
      if (!owner) {
        avisos.push(
          `«${t.property.name}» (${formatDate(t.date)}) no tiene propietario asignado, así que no se sabe a quién facturarla.`
        );
        continue;
      }
      const lista = porPropietario.get(owner.id) ?? [];
      lista.push(t);
      porPropietario.set(owner.id, lista);
    }

    const creados: ResumenDeFacturacion["creados"] = [];

    for (const [ownerId, tareas] of porPropietario) {
      const owner = tareas[0].property.owner!;
      const tipo = owner.documentoLimpieza === "RESUMEN" ? "RESUMEN" : "FACTURA";

      // Una factura sin el NIF y el domicilio del cliente no cumple el
      // RD 1619/2012. Mejor no emitirla que emitirla mal: emitida no se
      // deshace. El resumen no es un documento fiscal y no los necesita.
      if (tipo === "FACTURA" && (!owner.taxId || !owner.address)) {
        const falta = [!owner.taxId && "el NIF/CIF", !owner.address && "el domicilio"]
          .filter(Boolean)
          .join(" y ");
        avisos.push(
          `A «${owner.name}» le falta ${falta}, y sin eso la factura no sería válida. ` +
            `Sus ${tareas.length} limpieza(s) se quedan sin facturar; complétalo en Ajustes.`
        );
        continue;
      }

      const subtotal = round2(tareas.reduce((sum, t) => sum + Number(t.price), 0));
      // El resumen es informativo: ni lleva impuesto ni lo repercute.
      const taxRate = tipo === "FACTURA" ? tipoImpositivo : 0;
      const { cuota: taxAmount, total } =
        tipo === "FACTURA" ? calcularImpuesto(subtotal, taxRate) : { cuota: 0, total: subtotal };
      const { partnerAAmount, partnerBAmount } = splitAmount(subtotal, partnerAPercent, partnerBPercent);

      const invoiceNumber = await siguienteNumero(organizationId, tipo);

      const invoice = await prisma.invoice.create({
        data: {
          organizationId,
          tipoDocumento: tipo,
          ownerId,
          invoiceNumber,
          // Copiados, no enlazados: lo que se imprimió es lo que se imprimió.
          billedToName: owner.name,
          billedToTaxId: owner.taxId,
          billedToAddress: owner.address,
          periodStart,
          periodEnd,
          status: "ISSUED",
          subtotal,
          taxRate,
          taxAmount,
          total,
          partnerAId: splitConfig?.partnerAId,
          partnerBId: splitConfig?.partnerBId,
          partnerAPercent,
          partnerBPercent,
          partnerAAmount,
          partnerBAmount,
          notes: data.notes || null,
        },
      });

      await prisma.invoiceLine.createMany({
        data: tareas.map((t) => ({
          invoiceId: invoice.id,
          cleaningTaskId: t.id,
          // Lo mismo que venía imprimiendo el workflow de n8n: quien recibe la
          // factura tiene que poder comprobar por qué cuesta lo que cuesta.
          description: descripcionDeLinea(t),
          propertyName: t.property.name,
          date: t.date,
          amount: t.price,
        })),
      });

      await prisma.cleaningTask.updateMany({
        where: { id: { in: tareas.map((t) => t.id) } },
        data: { invoiceId: invoice.id },
      });

      creados.push({
        id: invoice.id,
        numero: invoiceNumber,
        propietario: owner.name,
        tipo,
        total,
      });
    }

    if (creados.length === 0) {
      throw new ErrorDeNegocio(
        `No se ha podido emitir ningún documento. ${avisos.join(" ")}`.trim()
      );
    }

    revalidatePath("/cleaning");
    revalidatePath("/cleaning/invoices");
    // Al facturar, las tareas pasan a mostrarse como "facturada" en el tablero,
    // que se consulta desde los dos negocios.
    revalidatePath("/cleaning/tasks");
    revalidatePath("/rental/tasks");

    const resumen: ResumenDeFacturacion = { creados, pendientes: avisos };
    return resumen;
  });
}

export async function updateInvoiceStatus(invoiceId: string, status: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("facturacion");

    const factura = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { status: true, invoiceNumber: true },
    });
    if (!factura) throw new ErrorDeNegocio("Factura no encontrada");

    if (!puedeCambiarEstadoFactura(factura.status, status)) {
      // El caso que esto impide de verdad: devolver a borrador una factura ya
      // emitida. Una factura emitida no se deshace; se rectifica.
      throw new ErrorDeNegocio(
        `La factura ${factura.invoiceNumber} está ${(
          INVOICE_STATUS_LABEL[factura.status] ?? factura.status
        ).toLowerCase()} y no puede pasar a ` +
          `«${(INVOICE_STATUS_LABEL[status] ?? status).toLowerCase()}». ` +
          "Una factura emitida no vuelve a borrador: lo que esté mal se corrige " +
          "emitiendo una factura rectificativa."
      );
    }

    await prisma.invoice.updateMany({ where: { id: invoiceId, organizationId }, data: { status } });
    revalidatePath("/cleaning/invoices");
    revalidatePath(`/cleaning/invoices/${invoiceId}`);
  });
}

const splitSchema = z.object({
  partnerAId: z.string().min(1),
  partnerBId: z.string().min(1),
  partnerAPercent: z.coerce.number().min(0).max(100),
});

export async function updatePartnerSplit(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const raw = Object.fromEntries(formData.entries());
    const data = splitSchema.parse(raw);

    await prisma.partnerSplitConfig.create({
      data: {
        organizationId,
        partnerAId: data.partnerAId,
        partnerBId: data.partnerBId,
        partnerAPercent: data.partnerAPercent,
        partnerBPercent: round2(100 - data.partnerAPercent),
      },
    });

    revalidatePath("/cleaning/settings");
    revalidatePath("/cleaning");
  });
}

const partnerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
});

export async function updatePartnerName(partnerId: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const raw = Object.fromEntries(formData.entries());
    const data = partnerSchema.parse(raw);
    await prisma.partner.updateMany({
      where: { id: partnerId, organizationId },
      data: { name: data.name, email: data.email || null },
    });
    revalidatePath("/cleaning/settings");
    revalidatePath("/cleaning");
    revalidatePath("/cleaning/invoices");
  });
}

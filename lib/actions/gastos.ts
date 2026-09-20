"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { leerFechas } from "@/lib/fechas";

const gastoSchema = z.object({
  propertyId: z.string().min(1, "Falta la vivienda"),
  date: z.string().min(1, "Falta la fecha"),
  concept: z.string().min(1, "Falta el concepto"),
  supplier: z.string().optional(),
  amount: z.string().min(1, "Falta el importe"),
  notes: z.string().optional(),
});

/** Acepta «120,50» y «120.50», que es como la gente escribe un importe. */
function leerImporte(texto: string): number {
  const n = Number(texto.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Apunta un gasto de una vivienda.
 *
 * Hace falta para los informes: la comisión de gestión se calcula sobre lo que
 * queda **después de gastos**, así que sin ellos sale siempre alta y lo que se
 * le liquida al propietario, bajo.
 */
export async function crearGasto(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = gastoSchema.parse(Object.fromEntries(formData.entries()));

    const importe = leerImporte(data.amount);
    if (Number.isNaN(importe) || importe <= 0) {
      throw new ErrorDeNegocio("El importe tiene que ser un número mayor que cero.");
    }

    const { fechas, invalidas } = leerFechas(data.date);
    if (fechas.length === 0) {
      throw new ErrorDeNegocio(
        invalidas.length > 0 ? `No entiendo la fecha «${invalidas[0]}».` : "Falta la fecha."
      );
    }

    const vivienda = await prisma.property.findFirst({
      where: { id: data.propertyId, organizationId },
      select: { id: true, ownerId: true },
    });
    if (!vivienda) throw new ErrorDeNegocio("Esa vivienda no existe.");

    await prisma.expense.create({
      data: {
        organizationId,
        propertyId: vivienda.id,
        // Se guarda también a quién pertenecía la vivienda al apuntar el
        // gasto: si mañana cambia de propietario, el gasto sigue siendo del
        // que lo pagó.
        ownerId: vivienda.ownerId,
        date: fechas[0],
        concept: data.concept.trim(),
        supplier: data.supplier?.trim() || null,
        amount: importe,
        notes: data.notes?.trim() || null,
      },
    });

    revalidatePath("/rental/gastos");
    revalidatePath("/rental/reports");
  });
}

export async function borrarGasto(id: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    await prisma.expense.deleteMany({ where: { id, organizationId } });
    revalidatePath("/rental/gastos");
    revalidatePath("/rental/reports");
  });
}

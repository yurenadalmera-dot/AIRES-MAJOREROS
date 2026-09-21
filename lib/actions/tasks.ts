"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { precioParaLimpieza } from "@/lib/precio-limpieza";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { leerFechas } from "@/lib/fechas";

/**
 * Una tarea es un registro compartido: se consulta desde los paneles de los
 * dos negocios (tablero e informes en ambos, más facturación). Al cambiarla
 * hay que refrescar las rutas de ambos lados, no solo las del alquiler.
 */
function revalidateTaskViews() {
  revalidatePath("/rental");
  revalidatePath("/rental/tasks");
  revalidatePath("/rental/properties");
  revalidatePath("/rental/reports");
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/tasks");
  revalidatePath("/cleaning/reports");
  revalidatePath("/cleaning/invoices");
}

export async function assignEmployeeToTask(taskId: string, employeeId: string | null) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.limpiezas");
    await prisma.cleaningTask.updateMany({
      where: { id: taskId, organizationId },
      data: { employeeId: employeeId || null },
    });
    revalidateTaskViews();
  });
}

export async function updateTaskStatus(taskId: string, status: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.estado_tarea");
    await prisma.cleaningTask.updateMany({ where: { id: taskId, organizationId }, data: { status } });
    revalidateTaskViews();
  });
}

const limpiezaManualSchema = z.object({
  propertyId: z.string().min(1),
  /** Una fecha, o varias pegadas del Excel (una por línea). */
  date: z.string().min(1, "Falta la fecha"),
  employeeId: z.string().optional(),
  notes: z.string().optional(),
  /** Salida o repaso: la tarifa cobra distinto por cada una. */
  servicio: z.enum(["salida", "repaso"]).default("salida"),
  /** Cuánta gente se va. En blanco se cobra la base de la tarifa. */
  huespedes: z.coerce.number().int().min(0).optional(),
});

/**
 * Una limpieza que no sale de ninguna reserva.
 *
 * Hasta ahora las limpiezas solo nacían de una reserva de Lodgify, y a mano
 * solo se podían crear mantenimientos —que no se facturan—. Pero hay
 * viviendas que no están en Lodgify: las de Domingo Javier, por ejemplo, cuyas
 * limpiezas las encarga él. Sin esto no había forma de apuntarlas, y por tanto
 * tampoco de cobrarlas.
 *
 * El precio se copia del de la vivienda, igual que hace la sincronización.
 */
export async function crearLimpiezaManual(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.limpiezas");
    const data = limpiezaManualSchema.parse(Object.fromEntries(formData.entries()));

    const vivienda = await prisma.property.findFirst({
      where: { id: data.propertyId, organizationId },
      select: { name: true },
    });
    if (!vivienda) throw new ErrorDeNegocio("Esa vivienda no existe.");

    // El precio sale de la tarifa del propietario —base más tanto por huésped
    // adicional— y solo si no hay tarifa se cae al precio fijo de la vivienda.
    const { precio, explicacion } = await precioParaLimpieza({
      organizationId,
      propertyId: data.propertyId,
      servicio: data.servicio,
      huespedes: data.huespedes ?? null,
    });

    if (precio === null) {
      throw new ErrorDeNegocio(
        `No sé a cuánto cobrar la limpieza de «${vivienda.name}»: ${explicacion}`
      );
    }

    const { fechas, invalidas } = leerFechas(data.date);
    if (fechas.length === 0) {
      throw new ErrorDeNegocio(
        invalidas.length > 0
          ? `No entiendo estas fechas: ${invalidas.slice(0, 5).join(", ")}`
          : "Falta la fecha."
      );
    }

    // Las que ya existan no se duplican: pegar dos veces la misma columna no
    // debe dejar la limpieza apuntada dos veces, ni cobrarla dos veces.
    const yaHay = await prisma.cleaningTask.findMany({
      where: {
        organizationId,
        propertyId: data.propertyId,
        type: "CLEANING",
        date: { in: fechas },
      },
      select: { date: true },
    });
    const ocupadas = new Set(yaHay.map((t) => t.date.getTime()));
    const nuevas = fechas.filter((f) => !ocupadas.has(f.getTime()));

    if (nuevas.length > 0) {
      await prisma.cleaningTask.createMany({
        data: nuevas.map((fecha) => ({
          organizationId,
          propertyId: data.propertyId,
          type: "CLEANING",
          date: fecha,
          status: "PENDING",
          employeeId: data.employeeId || null,
          servicio: data.servicio,
          huespedes: data.huespedes ?? null,
          billable: true,
          price: precio,
          notes: data.notes || null,
        })),
      });
    }

    revalidateTaskViews();
    return {
      creadas: nuevas.length,
      repetidas: fechas.length - nuevas.length,
      invalidas,
      vivienda: vivienda.name,
    };
  });
}

const maintenanceSchema = z.object({
  propertyId: z.string().min(1),
  date: z.string().min(1),
  employeeId: z.string().optional(),
  notes: z.string().min(1),
});

export async function createMaintenanceTask(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.limpiezas");
    const raw = Object.fromEntries(formData.entries());
    const data = maintenanceSchema.parse(raw);

    await prisma.cleaningTask.create({
      data: {
        organizationId,
        propertyId: data.propertyId,
        type: "MAINTENANCE",
        date: new Date(data.date),
        status: "PENDING",
        employeeId: data.employeeId || null,
        billable: false,
        price: 0,
        notes: data.notes,
      },
    });

    revalidateTaskViews();
  });
}

export async function deleteTask(taskId: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.limpiezas");
    const task = await prisma.cleaningTask.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new ErrorDeNegocio("Tarea no encontrada");
    if (task.invoiceId) throw new ErrorDeNegocio("No se puede eliminar una tarea ya facturada");
    await prisma.cleaningTask.deleteMany({ where: { id: taskId, organizationId } });
    revalidateTaskViews();
  });
}

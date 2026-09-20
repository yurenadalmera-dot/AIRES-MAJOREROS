"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { conErroresLegibles, ErrorDeNegocio } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { cifrar, enmascarar } from "@/lib/secretos";
import { normalizarCanal } from "@/lib/comisiones-canal";

const integrationSchema = z.object({
  defaultPlatformPct: z.coerce.number().min(0).max(100),
  defaultBankPct: z.coerce.number().min(0).max(100),
  syncEnabled: z.coerce.boolean().optional(),
  apiKey: z.string().optional(),
});

export async function updateLodgifySettings(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const raw = Object.fromEntries(formData.entries());
    const data = integrationSchema.parse({ ...raw, syncEnabled: raw.syncEnabled === "on" });

    // La clave solo se toca cuando se escribe una nueva: dejar el campo
    // vacío significa «no la cambies», no «bórrala». Para quitarla se escribe
    // la palabra que dice la propia pantalla.
    const escrita = data.apiKey?.trim() ?? "";
    const quitar = escrita.toUpperCase() === "QUITAR";
    const nueva = !quitar && escrita.length > 0 ? escrita : null;

    const clave = quitar
      ? { apiKeyCifrada: null, apiKeyMasked: null }
      : nueva
        ? { apiKeyCifrada: cifrar(nueva), apiKeyMasked: enmascarar(nueva) }
        : {};

    await prisma.integrationSettings.upsert({
      where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
      update: {
        defaultPlatformPct: data.defaultPlatformPct,
        defaultBankPct: data.defaultBankPct,
        syncEnabled: !!data.syncEnabled,
        ...clave,
      },
      create: {
        organizationId,
        provider: "LODGIFY",
        defaultPlatformPct: data.defaultPlatformPct,
        defaultBankPct: data.defaultBankPct,
        syncEnabled: !!data.syncEnabled,
        apiKeyCifrada: nueva ? cifrar(nueva) : null,
        apiKeyMasked: nueva ? enmascarar(nueva) : null,
      },
    });

    revalidatePath("/rental/settings");
  });
}

const businessSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  // Solo lo trae el formulario de limpiezas; en el de alquiler no existe.
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

export async function updateBusinessInfo(businessId: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const raw = Object.fromEntries(formData.entries());
    const data = businessSchema.parse(raw);
    // Los dos formularios de ajustes (alquiler y limpiezas) editan el mismo
    // tipo de ficha pero no enseñan los mismos campos. Un campo que no viene
    // en el formulario significa «no lo toques», nunca «bórralo»: hasta ahora
    // guardar los datos del negocio de alquiler vaciaba en silencio el correo
    // y el teléfono de contacto, que solo se editan desde el otro.
    const cambios: Prisma.BusinessUpdateManyMutationInput = { name: data.name };
    if (data.legalName !== undefined) cambios.legalName = data.legalName || null;
    if (data.taxId !== undefined) cambios.taxId = data.taxId || null;
    if (data.contactEmail !== undefined) cambios.contactEmail = data.contactEmail || null;
    if (data.contactPhone !== undefined) cambios.contactPhone = data.contactPhone || null;
    if (data.address !== undefined) cambios.address = data.address || null;
    if (data.taxRate !== undefined) cambios.taxRate = data.taxRate;

    await prisma.business.updateMany({ where: { id: businessId, organizationId }, data: cambios });
    revalidatePath("/rental/settings");
    revalidatePath("/cleaning/settings");
    revalidatePath("/rental");
    revalidatePath("/cleaning");
  });
}

const comisionCanalSchema = z.object({
  channel: z.string().min(1, "Falta el nombre del canal"),
  platformPct: z.coerce.number().min(0).max(100),
  /** Vacío = vale para todas las viviendas de ese canal. */
  propertyId: z.string().optional(),
  /** Vacío = se usa la comisión bancaria general. */
  bankPct: z.string().optional(),
});

/**
 * Fija la comisión de un canal de venta.
 *
 * Se guarda una fila por canal. El nombre se normaliza para compararlo, de
 * forma que «Booking.com» y «booking .com» no acaben siendo dos canales.
 */
export async function guardarComisionCanal(formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    const data = comisionCanalSchema.parse(Object.fromEntries(formData.entries()));
    const channel = data.channel.trim();
    const propertyId = data.propertyId?.trim() || null;

    // La bancaria vacía significa «la general», no «cero».
    const bankPct =
      data.bankPct === undefined || data.bankPct.trim() === ""
        ? null
        : Number(String(data.bankPct).replace(",", "."));
    if (bankPct !== null && (Number.isNaN(bankPct) || bankPct < 0 || bankPct > 100)) {
      throw new ErrorDeNegocio("La comisión bancaria tiene que estar entre 0 y 100.");
    }

    if (propertyId) {
      const suya = await prisma.property.findFirst({
        where: { id: propertyId, organizationId },
        select: { id: true },
      });
      if (!suya) throw new ErrorDeNegocio("Esa vivienda no existe.");
    }

    const existentes = await prisma.channelCommission.findMany({ where: { organizationId } });
    const yaEsta = existentes.find(
      (c) => normalizarCanal(c.channel) === normalizarCanal(channel) && c.propertyId === propertyId
    );

    if (yaEsta) {
      await prisma.channelCommission.update({
        where: { id: yaEsta.id },
        data: { platformPct: data.platformPct, channel, bankPct },
      });
    } else {
      await prisma.channelCommission.create({
        data: { organizationId, channel, propertyId, platformPct: data.platformPct, bankPct },
      });
    }

    revalidatePath("/rental/settings");
  });
}

/** Quita la comisión de un canal: vuelve a usarse el porcentaje general. */
export async function borrarComisionCanal(id: string) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("operativa.alquiler");
    await prisma.channelCommission.deleteMany({ where: { id, organizationId } });
    revalidatePath("/rental/settings");
  });
}

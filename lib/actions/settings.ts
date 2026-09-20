"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { conErroresLegibles } from "@/lib/errores";
import { exigir } from "@/lib/auth";
import { cifrar, enmascarar } from "@/lib/secretos";

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
});

export async function updateBusinessInfo(businessId: string, formData: FormData) {
  return conErroresLegibles(async () => {
    const organizationId = await exigir("administracion");
    const raw = Object.fromEntries(formData.entries());
    const data = businessSchema.parse(raw);
    await prisma.business.updateMany({
      where: { id: businessId, organizationId },
      data: {
        name: data.name,
        legalName: data.legalName || null,
        taxId: data.taxId || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
      },
    });
    revalidatePath("/rental/settings");
    revalidatePath("/cleaning/settings");
    revalidatePath("/rental");
    revalidatePath("/cleaning");
  });
}

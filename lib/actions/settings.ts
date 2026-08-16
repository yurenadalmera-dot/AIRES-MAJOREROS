"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("No autenticado");
  return session.organizationId;
}

const integrationSchema = z.object({
  defaultPlatformPct: z.coerce.number().min(0).max(100),
  defaultBankPct: z.coerce.number().min(0).max(100),
  syncEnabled: z.coerce.boolean().optional(),
  apiKey: z.string().optional(),
});

export async function updateLodgifySettings(formData: FormData) {
  const organizationId = await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = integrationSchema.parse({ ...raw, syncEnabled: raw.syncEnabled === "on" });

  const maskedKey = data.apiKey
    ? `${"•".repeat(Math.max(data.apiKey.length - 4, 0))}${data.apiKey.slice(-4)}`
    : undefined;

  await prisma.integrationSettings.upsert({
    where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    update: {
      defaultPlatformPct: data.defaultPlatformPct,
      defaultBankPct: data.defaultBankPct,
      syncEnabled: !!data.syncEnabled,
      ...(maskedKey ? { apiKeyMasked: maskedKey } : {}),
    },
    create: {
      organizationId,
      provider: "LODGIFY",
      defaultPlatformPct: data.defaultPlatformPct,
      defaultBankPct: data.defaultBankPct,
      syncEnabled: !!data.syncEnabled,
      apiKeyMasked: maskedKey ?? null,
    },
  });

  revalidatePath("/rental/settings");
}

const businessSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
});

export async function updateBusinessInfo(businessId: string, formData: FormData) {
  await requireOrg();
  const raw = Object.fromEntries(formData.entries());
  const data = businessSchema.parse(raw);
  await prisma.business.update({
    where: { id: businessId },
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
}

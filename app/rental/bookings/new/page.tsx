import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import BookingForm from "@/components/BookingForm";
import { createBooking } from "@/lib/actions/bookings";

export default async function NewBookingPage() {
  const { organizationId } = await requireBusinessContext();

  const [properties, settings] = await Promise.all([
    prisma.property.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
    prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Nueva reserva" subtitle="Registro manual de una reserva (directa, teléfono, etc.)" />
      <BookingForm
        properties={properties}
        defaultPlatformPct={settings ? Number(settings.defaultPlatformPct) : 15}
        defaultBankPct={settings ? Number(settings.defaultBankPct) : 2.5}
        action={createBooking}
        redirectTo="/rental/bookings"
      />
    </div>
  );
}

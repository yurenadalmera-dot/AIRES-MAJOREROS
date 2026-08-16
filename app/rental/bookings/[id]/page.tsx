import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge } from "@/components/ui";
import BookingForm from "@/components/BookingForm";
import { updateBooking, deleteBooking, setBookingManualLock } from "@/lib/actions/bookings";
import DeleteBookingButton from "@/components/DeleteBookingButton";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireBusinessContext();

  const [booking, properties, settings] = await Promise.all([
    prisma.booking.findFirst({ where: { id, organizationId } }),
    prisma.property.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
    prisma.integrationSettings.findUnique({
      where: { organizationId_provider: { organizationId, provider: "LODGIFY" } },
    }),
  ]);

  if (!booking) notFound();

  async function updateAction(formData: FormData) {
    "use server";
    await updateBooking(id, formData);
  }

  async function deleteAction() {
    "use server";
    await deleteBooking(id);
  }

  async function toggleLockAction(formData: FormData) {
    "use server";
    await setBookingManualLock(id, formData.get("locked") === "true");
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Editar reserva"
        subtitle={booking.source === "LODGIFY" ? `Sincronizada desde Lodgify · ID ${booking.lodgifyBookingId}` : "Reserva manual"}
        actions={
          <div className="flex items-center gap-2">
            {booking.manuallyAdjusted && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">🔒 Ajustada manualmente</Badge>
            )}
            <DeleteBookingButton deleteAction={deleteAction} />
          </div>
        }
      />

      {booking.source === "LODGIFY" && (
        <form action={toggleLockAction} className="card p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Protección frente a la sincronización con Lodgify</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {booking.manuallyAdjusted
                ? "Esta reserva está bloqueada: el próximo sync de Lodgify no la sobrescribirá."
                : "Cualquier edición manual la bloquea automáticamente. También puedes bloquearla ahora sin editar nada."}
            </p>
          </div>
          <input type="hidden" name="locked" value={(!booking.manuallyAdjusted).toString()} />
          <button type="submit" className="btn-secondary text-xs">
            {booking.manuallyAdjusted ? "Desbloquear (volver a automático)" : "Bloquear ahora"}
          </button>
        </form>
      )}

      <BookingForm
        properties={properties}
        initial={{
          propertyId: booking.propertyId,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          guestPhone: booking.guestPhone,
          adults: booking.adults,
          children: booking.children,
          checkIn: format(booking.checkIn, "yyyy-MM-dd"),
          checkOut: format(booking.checkOut, "yyyy-MM-dd"),
          channel: booking.channel,
          totalPrice: Number(booking.totalPrice),
          platformCommissionPct: Number(booking.platformCommissionPct),
          bankCommissionPct: Number(booking.bankCommissionPct),
          notes: booking.notes,
        }}
        defaultPlatformPct={settings ? Number(settings.defaultPlatformPct) : 15}
        defaultBankPct={settings ? Number(settings.defaultBankPct) : 2.5}
        action={updateAction}
        redirectTo="/rental/bookings"
      />
    </div>
  );
}

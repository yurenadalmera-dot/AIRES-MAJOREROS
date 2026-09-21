import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge } from "@/components/ui";
import BookingForm from "@/components/BookingForm";
import { updateBooking, deleteBooking, setBookingManualLock } from "@/lib/actions/bookings";
import DeleteBookingButton from "@/components/DeleteBookingButton";
import FormularioConAviso from "@/components/FormularioConAviso";
import ParteDeLaReserva from "@/components/ParteDeLaReserva";
import { viajerosDeLaReserva } from "@/lib/parte-viajeros";

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

  const viajeros = await viajerosDeLaReserva(organizationId, booking.id);

  async function updateAction(formData: FormData) {
    "use server";
    return updateBooking(id, formData);
  }

  async function deleteAction() {
    "use server";
    return deleteBooking(id);
  }

  async function toggleLockAction(formData: FormData) {
    "use server";
    return setBookingManualLock(id, formData.get("locked") === "true");
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Editar reserva"
        subtitle={booking.source === "LODGIFY" ? `Sincronizada desde Lodgify · ID ${booking.lodgifyBookingId}` : "Reserva manual"}
        actions={
          <div className="flex items-center gap-2">
            {booking.manuallyAdjusted && (
              <Badge tono="aviso">Ajustada a mano</Badge>
            )}
            <DeleteBookingButton deleteAction={deleteAction} />
          </div>
        }
      />

      {booking.source === "LODGIFY" && (
        <FormularioConAviso action={toggleLockAction} className="card p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-tinta">Protección frente a la sincronización con Lodgify</p>
            <p className="text-xs text-tinta-suave mt-0.5">
              {booking.manuallyAdjusted
                ? "Esta reserva está bloqueada: el próximo sync de Lodgify no la sobrescribirá."
                : "Cualquier edición manual la bloquea automáticamente. También puedes bloquearla ahora sin editar nada."}
            </p>
          </div>
          <input type="hidden" name="locked" value={(!booking.manuallyAdjusted).toString()} />
          <button type="submit" className="btn-secondary text-xs">
            {booking.manuallyAdjusted ? "Desbloquear (volver a automático)" : "Bloquear ahora"}
          </button>
        </FormularioConAviso>
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

      {/* Los datos que hay que dar a la policía por cada persona que se aloja.
          Va aquí, en la reserva, porque es de esta reserva de quien son. */}
      <div className="mt-6">
        <ParteDeLaReserva
          bookingId={booking.id}
          esperados={booking.adults + booking.children}
          comunicadoEl={booking.comunicadoEl?.toISOString() ?? null}
          hayEnlace={Boolean(booking.huellaFormulario)}
          expira={booking.formularioExpira?.toISOString() ?? null}
          viajeros={viajeros.map((v) => ({
            id: v.id,
            titular: v.titular,
            nombre: v.nombre,
            apellido1: v.apellido1,
            apellido2: v.apellido2,
            tipoDocumento: v.tipoDocumento,
            documento: v.documento,
            numeroSoporte: v.numeroSoporte,
            nacionalidad: v.nacionalidad,
            fechaNacimiento: v.fechaNacimiento.toISOString(),
            parentesco: v.parentesco,
          }))}
        />
      </div>
    </div>
  );
}

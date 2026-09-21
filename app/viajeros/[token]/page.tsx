import { notFound } from "next/navigation";
import { formatDate } from "@/lib/money";
import { reservaDelEnlace } from "@/lib/parte-viajeros";
import { MarcaDoble } from "@/components/Marca";
import FormularioDeViajero from "@/components/FormularioDeViajero";

/**
 * Donde el huésped rellena sus datos, desde su móvil y antes de llegar.
 *
 * Es pública: no hay sesión, la autorización es el propio enlace. Por eso
 * enseña lo justo para que quien lo abre sepa que es suyo —la vivienda y las
 * fechas— y **nunca los datos de los demás viajeros**: de los ya registrados
 * solo el nombre, para saber a quién falta por meter.
 *
 * Estos datos hay que recogerlos por el Real Decreto 933/2021, que obliga a
 * registrar e informar a cada viajero que se aloja.
 */
export default async function ParteDeViajeros({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reserva = await reservaDelEnlace(token);

  // Un enlace que no vale y uno caducado dan lo mismo por fuera: decir cuál
  // de los dos es le diría a quien prueba tokens cuándo ha acertado.
  if (!reserva) notFound();

  const esperados = reserva.adults + reserva.children;
  const faltan = Math.max(0, esperados - reserva.huespedes.length);

  return (
    <div className="min-h-screen bg-arena px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <MarcaDoble className="mb-7" />

        <div className="card p-5 sm:p-6 mb-4">
          <h1 className="serif text-2xl text-marina">Datos de los viajeros</h1>
          <p className="text-sm text-tinta-suave mt-2">
            {reserva.property.name}
            {reserva.property.locality ? ` · ${reserva.property.locality}` : ""}
          </p>
          <p className="text-sm text-tinta-suave">
            Del {formatDate(reserva.checkIn)} al {formatDate(reserva.checkOut)}
          </p>
          <p className="text-sm text-tinta mt-3">
            La ley obliga a registrar los datos de cada persona que se aloja. Se guardan cifrados y
            solo se usan para el parte de viajeros.
          </p>
        </div>

        {reserva.comunicadoEl ? (
          <div className="card p-5 text-center">
            <p className="text-sm text-tinta">
              Los datos de esta reserva ya están comunicados. No hace falta hacer nada más.
            </p>
          </div>
        ) : (
          <>
            {reserva.huespedes.length > 0 && (
              <div className="card p-5 mb-4">
                <h2 className="text-[0.9375rem] font-semibold text-tinta mb-2">
                  Ya registrados ({reserva.huespedes.length} de {esperados})
                </h2>
                <ul className="space-y-1">
                  {reserva.huespedes.map((h) => (
                    <li key={h.id} className="text-sm text-tinta-suave">
                      {h.nombre} {h.apellido1} {h.apellido2 ?? ""}
                      {h.titular && <span className="badge badge-info ml-2">titular</span>}
                    </li>
                  ))}
                </ul>
                {faltan > 0 && (
                  <p className="text-xs text-aviso mt-2">
                    {faltan === 1 ? "Falta una persona" : `Faltan ${faltan} personas`} por
                    registrar.
                  </p>
                )}
              </div>
            )}

            <FormularioDeViajero
              token={token}
              primero={reserva.huespedes.length === 0}
              entrada={reserva.checkIn.toISOString()}
            />
          </>
        )}
      </div>
    </div>
  );
}

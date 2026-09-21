import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Cuántas limpiezas caen cada día de las próximas tres semanas.
 *
 * Sustituye al workflow «Previsión mensual limpiezas» de n8n, que cada lunes
 * dejaba en Gmail un PDF con el calendario del mes y los días fuertes en rojo.
 * Aquella previsión leía de Airtable, que ya no recibe nada; y además un PDF
 * en el correo se mira una vez, mientras que esto está donde se trabaja.
 *
 * Para qué sirve: un día con seis limpiezas no lo saca una persona sola. Verlo
 * con tres semanas de margen es lo que permite pedir refuerzo a tiempo, en vez
 * de descubrirlo esa mañana.
 *
 * El umbral es el mismo que traía n8n: **seis o más es día fuerte**.
 */

const DIAS_A_LA_VISTA = 21;
export const CARGA_FUERTE = 6;

export default function CargaPorDia({ fechas }: { fechas: string[] }) {
  const hoy = startOfDay(new Date());
  const dias = Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => addDays(hoy, i));
  const pendientes = fechas.map((f) => new Date(f));

  const carga = dias.map((d) => ({
    dia: d,
    cuantas: pendientes.filter((p) => isSameDay(p, d)).length,
  }));

  const total = carga.reduce((s, c) => s + c.cuantas, 0);
  if (total === 0) return null;

  const fuertes = carga.filter((c) => c.cuantas >= CARGA_FUERTE);
  const tope = Math.max(...carga.map((c) => c.cuantas), 1);

  return (
    <section className="card p-4 sm:p-5 mb-5 no-print" aria-labelledby="carga">
      <div className="card-titulo">
        <h2 id="carga">Carga de las próximas tres semanas</h2>
        <p className="text-xs text-tinta-suave">
          {total} {total === 1 ? "limpieza pendiente" : "limpiezas pendientes"}
        </p>
      </div>

      {fuertes.length > 0 && (
        <p className="mb-3 text-sm text-aviso">
          {fuertes.length === 1 ? "Hay un día" : `Hay ${fuertes.length} días`} con{" "}
          {CARGA_FUERTE} limpiezas o más:{" "}
          <span className="font-medium">
            {fuertes.map((c) => format(c.dia, "d MMM", { locale: es })).join(", ")}
          </span>
          . Conviene mirar si hace falta refuerzo.
        </p>
      )}

      {/* Una barra por día. La altura es relativa al día más cargado, así que
          se compara de un vistazo sin tener que leer los números. */}
      <ol className="flex items-end gap-1 overflow-x-auto pb-1">
        {carga.map(({ dia, cuantas }) => {
          const fuerte = cuantas >= CARGA_FUERTE;
          return (
            <li key={dia.toISOString()} className="flex min-w-[2.1rem] flex-1 flex-col items-center gap-1">
              <span className={`cifra text-xs ${fuerte ? "font-semibold text-aviso" : "text-tinta-suave"}`}>
                {cuantas || ""}
              </span>
              <span
                aria-hidden
                className={`w-full rounded-t ${fuerte ? "bg-acento" : cuantas ? "bg-oceano" : "bg-borde"}`}
                style={{ height: `${Math.max(3, (cuantas / tope) * 64)}px` }}
              />
              <span className="text-[0.6875rem] leading-tight text-tinta-suave text-center">
                {format(dia, "EEEEE", { locale: es })}
                <br />
                {format(dia, "d")}
              </span>
              <span className="sr-only">
                {format(dia, "EEEE d 'de' MMMM", { locale: es })}: {cuantas}{" "}
                {cuantas === 1 ? "limpieza" : "limpiezas"}
                {fuerte ? " (día fuerte)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

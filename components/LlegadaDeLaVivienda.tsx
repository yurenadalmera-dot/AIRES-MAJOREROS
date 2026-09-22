import { guardarLlegadaDeLaVivienda } from "@/lib/actions/properties";
import FormularioConAviso from "@/components/FormularioConAviso";
import { Aviso } from "@/components/ui";

/**
 * Lo que hay que contarle al huésped de esta vivienda.
 *
 * Esto hoy se contesta por WhatsApp, cada vez, muchas veces de noche. Puesto
 * aquí se escribe una vez y se manda solo unos días antes de la entrada.
 *
 * El código de la caja de llaves se guarda cifrado y **no se vuelve a
 * enseñar**: es una llave, no un dato. Por eso el campo sale siempre vacío,
 * y dejarlo vacío no borra el que hubiera.
 */
export default function LlegadaDeLaVivienda({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: {
    address: string | null;
    comoLlegar: string | null;
    mapaUrl: string | null;
    horaEntrada: string | null;
    horaSalida: string | null;
    wifiRed: string | null;
    wifiClave: string | null;
    normas: string | null;
    tieneCodigoDeLlave: boolean;
  };
}) {
  return (
    <section className="card p-4 sm:p-5 mb-4">
      <div className="card-titulo">
        <h2>Cómo llegar y entrar</h2>
      </div>
      <p className="ayuda mb-3">
        Se lo mandamos al huésped unos días antes de que llegue. Escrito una vez aquí, deja de
        contestarse a mano cada vez.
      </p>

      <FormularioConAviso action={guardarLlegadaDeLaVivienda} className="space-y-3">
        <input type="hidden" name="propertyId" value={propertyId} />

        <div>
          <label className="label" htmlFor="l-dir">
            Dirección
          </label>
          <input
            id="l-dir"
            name="address"
            defaultValue={initial.address ?? ""}
            className="input"
            placeholder="Calle, número, portal…"
          />
        </div>

        <div>
          <label className="label" htmlFor="l-como">
            Cómo se llega
          </label>
          <textarea
            id="l-como"
            name="comoLlegar"
            rows={4}
            defaultValue={initial.comoLlegar ?? ""}
            className="input"
            placeholder="El desvío que no sale en el mapa, dónde aparcar, qué portal es…"
          />
          <p className="ayuda">Lo que de verdad preguntan, no lo que ya dice el mapa.</p>
        </div>

        <div>
          <label className="label" htmlFor="l-mapa">
            Enlace al mapa
          </label>
          <input
            id="l-mapa"
            name="mapaUrl"
            type="url"
            defaultValue={initial.mapaUrl ?? ""}
            className="input"
            placeholder="https://…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="l-hent">
              Hora de entrada
            </label>
            <input
              id="l-hent"
              name="horaEntrada"
              defaultValue={initial.horaEntrada ?? ""}
              className="input"
              placeholder="16:00"
            />
          </div>
          <div>
            <label className="label" htmlFor="l-hsal">
              Hora de salida
            </label>
            <input
              id="l-hsal"
              name="horaSalida"
              defaultValue={initial.horaSalida ?? ""}
              className="input"
              placeholder="10:00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="l-wifi">
              Red wifi
            </label>
            <input id="l-wifi" name="wifiRed" defaultValue={initial.wifiRed ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="l-wific">
              Contraseña del wifi
            </label>
            <input
              id="l-wific"
              name="wifiClave"
              defaultValue={initial.wifiClave ?? ""}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="l-normas">
            Normas de la casa
          </label>
          <textarea
            id="l-normas"
            name="normas"
            rows={3}
            defaultValue={initial.normas ?? ""}
            className="input"
            placeholder="Basura, ruido, mascotas…"
          />
        </div>

        <div>
          <label className="label" htmlFor="l-codigo">
            Código de la caja de llaves
          </label>
          <input
            id="l-codigo"
            name="codigoLlave"
            autoComplete="off"
            className="input"
            placeholder={initial.tieneCodigoDeLlave ? "Hay uno guardado" : "Sin guardar"}
          />
          <p className="ayuda">
            Se guarda cifrado y no se vuelve a enseñar. Déjalo en blanco para no tocarlo; escribe un
            guion (–) para borrarlo.
          </p>
        </div>

        {/* Que quede escrito en la pantalla, no solo en el código: quien
            rellena esto tiene que saber que el código no viaja con lo demás. */}
        <Aviso tono="info">
          El código de la caja de llaves <strong>no sale en ese correo</strong>. Un correo se queda
          para siempre en el buzón de mucha gente y el código no cambia entre un huésped y el
          siguiente, así que se manda aparte, el día de la entrada.
        </Aviso>

        <button type="submit" className="btn-primary">
          Guardar
        </button>
      </FormularioConAviso>
    </section>
  );
}

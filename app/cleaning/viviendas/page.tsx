import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/money";

/**
 * Las viviendas que limpia Aires Majoreros.
 *
 * No es la ficha del alquiler: aquí no pintan ni el propietario ni sus
 * ingresos. Lo que hace falta para ir a limpiarlas es dónde están, cómo son
 * —cuántas habitaciones y cuántos baños, que es lo que marca el tiempo y lo
 * que hay que subir— y a cuánto sale cada servicio, que es lo que se factura.
 */
export default async function ViviendasQueLimpiamos() {
  const { organizationId } = await requireBusinessContext("operativa.limpiezas");

  const viviendas = await prisma.property.findMany({
    where: { organizationId, active: true },
    orderBy: [{ locality: "asc" }, { name: "asc" }],
    include: {
      TarifaVivienda: { select: { servicio: true, precioCerrado: true } },
      owner: { select: { name: true, tarifa: { select: { lineas: true } } } },
      _count: { select: { cleaningTasks: true } },
    },
  });

  // Agrupadas por localidad: las limpiadoras se mueven por zonas, y cuatro
  // apartamentos en el mismo portal son una sola parada.
  const porZona = new Map<string, typeof viviendas>();
  for (const v of viviendas) {
    const lista = porZona.get(v.locality) ?? [];
    lista.push(v);
    porZona.set(v.locality, lista);
  }

  /** Qué se cobra por una salida en esta vivienda, y de dónde sale. */
  function precioDeSalida(v: (typeof viviendas)[number]): string {
    const cerrado = v.TarifaVivienda.find((t) => t.servicio === "salida");
    if (cerrado) return `${formatCurrency(Number(cerrado.precioCerrado))} cerrado`;
    const linea = v.owner?.tarifa?.lineas.find((l) => l.servicio === "salida");
    if (linea) {
      const base = formatCurrency(Number(linea.base));
      const extra = Number(linea.porHuespedAdicional);
      return extra > 0
        ? `${base} hasta ${linea.huespedesIncluidos} · +${formatCurrency(extra)} por persona`
        : base;
    }
    const fijo = Number(v.cleaningPrice);
    return fijo > 0 ? formatCurrency(fijo) : "Sin tarifa";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viviendas que limpiamos"
        subtitle="Dónde están, cómo son y a cuánto sale cada servicio."
        serif
      />

      {viviendas.length === 0 ? (
        <EmptyState icono="casa" message="Todavía no hay viviendas dadas de alta." />
      ) : (
        [...porZona.entries()].map(([zona, lista]) => (
          <section key={zona} className="card overflow-x-auto">
            <div className="card-titulo px-4 pt-4 sm:px-5">
              <h2>{zona}</h2>
              <span className="cifra text-xs text-tinta-suave">
                {lista.length === 1 ? "1 vivienda" : `${lista.length} viviendas`}
              </span>
            </div>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Vivienda</th>
                  <th>Dirección</th>
                  <th className="num">Plazas</th>
                  <th className="num">Hab.</th>
                  <th className="num">Baños</th>
                  <th>Salida</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium text-tinta">{v.name}</td>
                    <td className="text-tinta-suave">
                      {v.address ?? <span className="text-aviso">sin dirección</span>}
                    </td>
                    <td className="num">{v.capacity}</td>
                    <td className="num">{v.bedrooms}</td>
                    <td className="num">{v.bathrooms}</td>
                    <td className="text-xs text-tinta-suave">{precioDeSalida(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      <p className="text-xs text-tinta-suave">
        Las plazas, las habitaciones y los baños salen de la ficha de la vivienda. Si alguno no
        cuadra, hay que corregirlo allí: de ahí sale también lo que hay que preparar.
      </p>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader } from "@/components/ui";
import Gastos from "@/components/Gastos";
import SubirFactura from "@/components/SubirFactura";
import type { Pendiente } from "@/components/SubirFactura";

export default async function GastosPage() {
  const { organizationId } = await requireBusinessContext("operativa.alquiler");

  const [viviendas, gastos, documentos] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expense.findMany({
      where: { organizationId },
      orderBy: { date: "desc" },
      take: 200,
      include: { property: { select: { name: true } } },
    }),
    // Lo dudoso primero: en una bandeja ordenada al revés, lo que hay que
    // mirar queda abajo. Sin `contenido`, que es el archivo entero.
    prisma.documentoOcr.findMany({
      where: { organizationId, estado: "pendiente" },
      orderBy: [{ fiabilidad: "asc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        archivoNombre: true,
        createdAt: true,
        datosIa: true,
        fiabilidad: true,
        motivos: true,
        avisos: true,
      },
    }),
  ]);

  const leerLista = (texto: string | null): string[] => {
    if (!texto) return [];
    try {
      const v = JSON.parse(texto);
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };

  const pendientes: Pendiente[] = documentos.map((doc) => {
    let datos: { proveedor_literal?: unknown; total?: unknown } = {};
    try {
      if (doc.datosIa) datos = JSON.parse(doc.datosIa) ?? {};
    } catch {
      datos = {};
    }
    return {
      id: doc.id,
      archivoNombre: doc.archivoNombre,
      subida: doc.createdAt.toISOString(),
      proveedor: typeof datos.proveedor_literal === "string" ? datos.proveedor_literal : null,
      total: typeof datos.total === "number" && datos.total > 0 ? datos.total : null,
      fiabilidad: doc.fiabilidad === null ? null : Number(doc.fiabilidad),
      motivos: leerLista(doc.motivos),
      avisos: leerLista(doc.avisos).length,
    };
  });

  const visibles = gastos.map((g) => ({
    id: g.id,
    date: g.date.toISOString(),
    concept: g.concept,
    supplier: g.supplier,
    amount: Number(g.amount),
    propertyName: g.property?.name ?? "—",
  }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Gastos"
        subtitle="Lo que se gasta en cada vivienda. Entra en el informe al propietario y baja la base sobre la que se calcula la comisión de gestión."
      />
      <div className="mb-4">
        <SubirFactura viviendas={viviendas} pendientes={pendientes} />
      </div>
      <Gastos
        viviendas={viviendas}
        gastos={visibles}
        total={visibles.reduce((s, g) => s + g.amount, 0)}
      />
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/money";
import { INVOICE_STATUS_LABEL } from "@/lib/constants";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "badge-neutro",
  ISSUED: "badge-info",
  PAID: "badge-bien",
};

export default async function InvoicesPage() {
  const { organizationId } = await requireBusinessContext("facturacion");
  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    orderBy: { issueDate: "desc" },
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total), 0);

  return (
    <div>
      <PageHeader
        title="Historial de facturas"
        subtitle={`${
          invoices.length === 1 ? "1 factura" : `${invoices.length} facturas`
        } · ${formatCurrency(totalInvoiced)} en total`}
      />

      {invoices.length === 0 ? (
        <EmptyState
          icono="factura"
          message="Todavía no se ha generado ninguna factura. Se generan desde Facturación, con las limpiezas ya hechas de un periodo."
          accion={{ href: "/cleaning", label: "Ir a Facturación" }}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nº factura</th>
                <th>Cliente</th>
                <th>Periodo</th>
                <th>Emitida</th>
                <th>Estado</th>
                <th className="num">Total</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium text-tinta">{inv.invoiceNumber}</td>
                  <td>{inv.billedToName}</td>
                  <td>
                    {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                  </td>
                  <td>{formatDate(inv.issueDate)}</td>
                  <td>
                    <Badge className={STATUS_COLOR[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
                  </td>
                  <td className="num font-semibold text-tinta">{formatCurrency(inv.total)}</td>
                  <td>
                    <Link href={`/cleaning/invoices/${inv.id}`} className="enlace text-xs">
                      Ver factura
                      <span className="sr-only"> {inv.invoiceNumber}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/money";
import { INVOICE_STATUS_LABEL } from "@/lib/constants";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  ISSUED: "bg-amber-100 text-amber-800 border-amber-200",
  PAID: "bg-green-100 text-green-800 border-green-200",
};

export default async function InvoicesPage() {
  const { organizationId } = await requireBusinessContext();
  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    orderBy: { issueDate: "desc" },
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total), 0);

  return (
    <div>
      <PageHeader title="Historial de facturas" subtitle={`${invoices.length} factura(s) · ${formatCurrency(totalInvoiced)} en total`} />

      {invoices.length === 0 ? (
        <EmptyState message="Todavía no se ha generado ninguna factura." />
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
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium text-slate-700">{inv.invoiceNumber}</td>
                  <td>{inv.billedToName}</td>
                  <td>
                    {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                  </td>
                  <td>{formatDate(inv.issueDate)}</td>
                  <td>
                    <Badge className={STATUS_COLOR[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
                  </td>
                  <td className="font-medium">{formatCurrency(inv.total)}</td>
                  <td>
                    <Link href={`/cleaning/invoices/${inv.id}`} className="text-xs text-aires-700 hover:underline">
                      Ver →
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

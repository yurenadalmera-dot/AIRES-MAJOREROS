import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PrintButton, BackButton, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/money";
import { INVOICE_STATUS_LABEL, BUSINESS_TYPES } from "@/lib/constants";
import { updateInvoiceStatus } from "@/lib/actions/invoices";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireBusinessContext();

  const [invoice, cleaningBusiness] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { invoiceLines: { orderBy: { date: "asc" } } },
    }),
    prisma.business.findFirst({ where: { organizationId, type: BUSINESS_TYPES.CLEANING_BILLING } }),
  ]);
  if (!invoice) notFound();

  const [partnerA, partnerB] = await Promise.all([
    invoice.partnerAId ? prisma.partner.findUnique({ where: { id: invoice.partnerAId } }) : null,
    invoice.partnerBId ? prisma.partner.findUnique({ where: { id: invoice.partnerBId } }) : null,
  ]);

  async function statusAction(formData: FormData) {
    "use server";
    await updateInvoiceStatus(id, formData.get("status") as string);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 no-print">
        <BackButton href="/cleaning/invoices" />
        <div className="flex items-center gap-2">
          <form action={statusAction} className="flex items-center gap-2">
            <select name="status" defaultValue={invoice.status} className="input py-1.5 text-xs">
              {Object.entries(INVOICE_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary text-xs">
              Actualizar estado
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      <div className="card print-area p-8">
        <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Factura {invoice.invoiceNumber}</h1>
            <p className="text-sm text-slate-500 mt-1">{cleaningBusiness?.legalName ?? cleaningBusiness?.name}</p>
          </div>
          <div className="text-right">
            <Badge className="mb-2">{INVOICE_STATUS_LABEL[invoice.status]}</Badge>
            <p className="text-sm text-slate-500">Emitida el {formatDate(invoice.issueDate)}</p>
            <p className="text-sm text-slate-500">
              Periodo: {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-slate-400">Facturado a</p>
          <p className="text-base font-medium text-slate-800">{invoice.billedToName}</p>
          {invoice.billedToTaxId && <p className="text-sm text-slate-500">NIF/CIF: {invoice.billedToTaxId}</p>}
        </div>

        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Vivienda</th>
              <th>Concepto</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoiceLines.map((line) => (
              <tr key={line.id}>
                <td>{formatDate(line.date)}</td>
                <td>{line.propertyName}</td>
                <td>{line.description}</td>
                <td>{formatCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={3}>Total factura</td>
              <td>{formatCurrency(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes && (
          <p className="text-sm text-slate-500 mt-4">
            <span className="font-medium">Notas:</span> {invoice.notes}
          </p>
        )}

        <div className="mt-8 border-t border-slate-200 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Reparto entre socias</p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">
                {partnerA?.name ?? "Socia 1"} ({Number(invoice.partnerAPercent)}%)
              </p>
              <p className="font-medium text-slate-800">{formatCurrency(invoice.partnerAAmount)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">
                {partnerB?.name ?? "Socia 2"} ({Number(invoice.partnerBPercent)}%)
              </p>
              <p className="font-medium text-slate-800">{formatCurrency(invoice.partnerBAmount)}</p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 mt-8">
          Documento de demostración. No incluye IVA ni datos bancarios reales — configúralo con tu asesoría antes de
          un uso real.
        </p>
      </div>
    </div>
  );
}

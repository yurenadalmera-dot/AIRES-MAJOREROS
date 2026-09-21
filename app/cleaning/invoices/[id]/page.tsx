import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBusinessContext } from "@/lib/business-context";
import { PrintButton, BackButton, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/money";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TRANSITIONS, BUSINESS_TYPES } from "@/lib/constants";
import { updateInvoiceStatus } from "@/lib/actions/invoices";
import FormularioConAviso from "@/components/FormularioConAviso";
import { Marca } from "@/components/Marca";

/** Mismo criterio que en el historial de facturas. */
const ESTADO_TONO: Record<string, string> = {
  DRAFT: "badge-neutro",
  ISSUED: "badge-info",
  PAID: "badge-bien",
};

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
    // Se devuelve el resultado, no se descarta: si el cambio se rechaza —una
    // factura emitida no vuelve a borrador— el motivo tiene que llegar a la
    // pantalla.
    return updateInvoiceStatus(id, formData.get("status") as string);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 no-print">
        <BackButton href="/cleaning/invoices" />
        <div className="flex items-center gap-2">
          <FormularioConAviso action={statusAction} className="flex items-center gap-2">
            {/* Solo los estados a los que esta factura puede ir: una emitida
                no vuelve a borrador. Ver INVOICE_STATUS_TRANSITIONS. */}
            <select name="status" defaultValue={invoice.status} className="input py-1.5 text-xs">
              {(INVOICE_STATUS_TRANSITIONS[invoice.status] ?? [invoice.status]).map((value: string) => (
                <option key={value} value={value}>
                  {INVOICE_STATUS_LABEL[value] ?? value}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary text-xs">
              Actualizar estado
            </button>
          </FormularioConAviso>
          <PrintButton />
        </div>
      </div>

      <div className="card print-area p-8">
        <div className="flex justify-between items-start border-b border-borde pb-4 mb-6">
          <div>
            {/* El logotipo de quien emite. Esta factura la emite Aires
                Majoreros, así que aquí sí va su marca: es su documento. */}
            <Marca negocio="cleaning" alto={48} className="mb-3" />
            <h1 className="serif text-2xl text-marina">Factura {invoice.invoiceNumber}</h1>
            {/* Quien emite: razón social, NIF y domicilio. Los tres son
                obligatorios en una factura. */}
            <p className="text-sm font-medium text-tinta mt-1">
              {cleaningBusiness?.legalName ?? cleaningBusiness?.name}
            </p>
            {cleaningBusiness?.taxId && (
              <p className="text-sm text-tinta-suave">NIF/CIF: {cleaningBusiness.taxId}</p>
            )}
            {cleaningBusiness?.address && (
              <p className="text-sm text-tinta-suave whitespace-pre-line">{cleaningBusiness.address}</p>
            )}
          </div>
          <div className="text-right">
            <Badge className={`mb-2 ${ESTADO_TONO[invoice.status] ?? "badge-neutro"}`}>
              {INVOICE_STATUS_LABEL[invoice.status]}
            </Badge>
            <p className="text-sm text-tinta-suave">Emitida el {formatDate(invoice.issueDate)}</p>
            <p className="text-sm text-tinta-suave">
              Periodo: {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-tinta-suave">Facturado a</p>
          <p className="text-base font-medium text-tinta">{invoice.billedToName}</p>
          {invoice.billedToTaxId && <p className="text-sm text-tinta-suave">NIF/CIF: {invoice.billedToTaxId}</p>}
          {invoice.billedToAddress && (
            <p className="text-sm text-tinta-suave whitespace-pre-line">{invoice.billedToAddress}</p>
          )}
        </div>

        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Vivienda</th>
              <th>Concepto</th>
              <th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoiceLines.map((line) => (
              <tr key={line.id}>
                <td>{formatDate(line.date)}</td>
                <td>{line.propertyName}</td>
                <td>{line.description}</td>
                <td className="num">{formatCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right">
                Base imponible
              </td>
              <td className="num">{formatCurrency(invoice.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right">
                IGIC ({Number(invoice.taxRate)} %)
              </td>
              <td className="num">{formatCurrency(invoice.taxAmount)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={3} className="text-right">
                Total factura
              </td>
              <td className="num">{formatCurrency(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes && (
          <p className="text-sm text-tinta-suave mt-4">
            <span className="font-medium">Notas:</span> {invoice.notes}
          </p>
        )}

        {/* Uso interno: NO se imprime. Cómo se reparte el dinero entre las
            socias no es asunto de quien recibe la factura. */}
        <div className="mt-8 border-t border-borde pt-4 no-print">
          <p className="text-xs uppercase tracking-wide text-tinta-suave mb-2">
            Reparto entre socias · solo aquí, no sale en la factura
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div className="rounded-lg bg-marina-suave border border-borde px-3 py-2">
              <p className="text-xs text-tinta-suave">
                {partnerA?.name ?? "Socia 1"} ({Number(invoice.partnerAPercent)}%)
              </p>
              <p className="font-medium text-tinta">{formatCurrency(invoice.partnerAAmount)}</p>
            </div>
            <div className="rounded-lg bg-marina-suave border border-borde px-3 py-2">
              <p className="text-xs text-tinta-suave">
                {partnerB?.name ?? "Socia 2"} ({Number(invoice.partnerBPercent)}%)
              </p>
              <p className="font-medium text-tinta">{formatCurrency(invoice.partnerBAmount)}</p>
            </div>
          </div>
        </div>

        {(!cleaningBusiness?.taxId || !cleaningBusiness?.address) && (
          <p className="text-[11px] text-mal mt-8 no-print">
            Faltan datos obligatorios de quien emite la factura
            {!cleaningBusiness?.taxId && " (NIF/CIF)"}
            {!cleaningBusiness?.taxId && !cleaningBusiness?.address && " y"}
            {!cleaningBusiness?.address && " (domicilio fiscal)"}. Complétalos en Ajustes antes de
            entregarla.
          </p>
        )}
      </div>
    </div>
  );
}

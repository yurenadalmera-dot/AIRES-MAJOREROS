import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import OwnerReportPrintView from "@/components/shared/OwnerReportPrintView";

export default async function CleaningOwnerReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string; start?: string; end?: string }>;
}) {
  const { organizationId } = await requireBusinessContext();
  const params = await searchParams;
  if (!params.ownerId || !params.start || !params.end) notFound();

  return (
    <OwnerReportPrintView
      organizationId={organizationId}
      ownerId={params.ownerId}
      start={params.start}
      end={params.end}
      backHref="/cleaning/reports"
    />
  );
}

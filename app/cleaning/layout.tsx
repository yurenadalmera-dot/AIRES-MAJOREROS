import Shell from "@/components/Shell";
import { requireBusinessContext } from "@/lib/business-context";
import { USER_ROLE_LABEL } from "@/lib/constants";

export default async function CleaningLayout({ children }: { children: React.ReactNode }) {
  const { session, rentalBusiness, cleaningBusiness } = await requireBusinessContext();

  return (
    <Shell
      activeBusiness="cleaning"
      businessName={cleaningBusiness?.name ?? "Facturación de limpiezas"}
      otherBusinessName={rentalBusiness?.name ?? "Alquileres vacacionales"}
      userName={session!.name}
      userRole={USER_ROLE_LABEL[session!.role] ?? session!.role}
    >
      {children}
    </Shell>
  );
}

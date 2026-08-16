import Shell from "@/components/Shell";
import { requireBusinessContext } from "@/lib/business-context";
import { USER_ROLE_LABEL } from "@/lib/constants";

export default async function RentalLayout({ children }: { children: React.ReactNode }) {
  const { session, rentalBusiness, cleaningBusiness } = await requireBusinessContext();

  return (
    <Shell
      activeBusiness="rental"
      businessName={rentalBusiness?.name ?? "Alquileres vacacionales"}
      otherBusinessName={cleaningBusiness?.name ?? "Facturación de limpiezas"}
      userName={session!.name}
      userRole={USER_ROLE_LABEL[session!.role] ?? session!.role}
    >
      {children}
    </Shell>
  );
}

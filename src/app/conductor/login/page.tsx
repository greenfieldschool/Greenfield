import { safeRedirect } from "@/lib/route-access";
import { ConductorLoginForm } from "@/app/conductor/login/ui";

export default function ConductorLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <ConductorLoginForm redirectTo={safeRedirect(searchParams.redirectTo, "conductor")} />;
}

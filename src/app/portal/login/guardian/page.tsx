import { safeRedirect } from "@/lib/route-access";
import { GuardianLoginForm } from "./ui";

export default function PortalGuardianLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <GuardianLoginForm redirectTo={safeRedirect(searchParams.redirectTo, "portal")} />;
}

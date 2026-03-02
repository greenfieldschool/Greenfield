import { GuardianLoginForm } from "./ui";

export default function PortalGuardianLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <GuardianLoginForm redirectTo={searchParams.redirectTo ?? "/portal"} />;
}

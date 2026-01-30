import { PortalLoginForm } from "@/app/portal/login/ui";

export default function PortalLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <PortalLoginForm redirectTo={searchParams.redirectTo ?? "/portal"} />;
}

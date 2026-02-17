import { ConductorLoginForm } from "@/app/conductor/login/ui";

export default function ConductorLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <ConductorLoginForm redirectTo={searchParams.redirectTo ?? "/conductor"} />;
}

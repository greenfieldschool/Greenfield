import { HELP } from "@/lib/portal-help";
import { Alert } from "@/components/ui/alert";
import { PortalPageHeader } from "../_components/portal-ui";
import { ChangePasswordForm } from "./change-password-form";

// Parents and pupils choose their own password here, after the school gives them a temporary one
// (Accounts & passwords, see the admission-and-accounts skill).
export default async function ChangePasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ expired?: string }> | { expired?: string };
}) {
  const sp = ((await searchParams) ?? {}) as { expired?: string };
  return (
    <div className="mx-auto max-w-lg space-y-6">
      {sp.expired === "1" ? (
        <Alert tone="warning" title="Time to choose your own password">
          The password the school gave you was for last term. Choose your own now to carry on using the portal.
        </Alert>
      ) : null}
      <PortalPageHeader
        back={{ href: "/portal", label: "Back to home" }}
        title="Choose your password"
        description="Pick something you'll remember that others won't guess. Nobody at the school can see it."
        help={HELP.account}
      />
      <ChangePasswordForm />
    </div>
  );
}

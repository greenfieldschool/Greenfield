import { HELP } from "@/lib/portal-help";
import { PortalPageHeader } from "../_components/portal-ui";
import { ChangePasswordForm } from "./change-password-form";

// Parents and pupils choose their own password here, after the school gives them a temporary one
// (Accounts & passwords, see the admission-and-accounts skill).
export default function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
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

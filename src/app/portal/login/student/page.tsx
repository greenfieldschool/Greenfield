import { safeRedirect } from "@/lib/route-access";
import { StudentLoginForm } from "./ui";

export default function PortalStudentLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <StudentLoginForm redirectTo={safeRedirect(searchParams.redirectTo, "portal")} />;
}

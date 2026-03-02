import { StudentLoginForm } from "./ui";

export default function PortalStudentLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <StudentLoginForm redirectTo={searchParams.redirectTo ?? "/portal"} />;
}

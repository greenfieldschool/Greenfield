import { AdminLoginForm } from "@/app/admin/login/ui";

export default function AdminLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <AdminLoginForm redirectTo={searchParams.redirectTo ?? "/admin"} />;
}

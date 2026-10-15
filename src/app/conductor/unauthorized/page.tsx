import Link from "next/link";
import { LogOut, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

export default function ConductorUnauthorizedPage() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Unauthorized"
          description="Your account is signed in, but it is not linked to a conductor profile."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/conductor/login" className={buttonClasses({ variant: "secondary" })}>
                Back to login
              </Link>
              <form action="/conductor/logout" method="post">
                <button type="submit" className={buttonClasses({ variant: "primary" })}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </div>
          }
        />
      </Card>
    </div>
  );
}

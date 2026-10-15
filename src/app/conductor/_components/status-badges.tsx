import { Badge, type BadgeTone } from "@/components/ui/badge";

// Status pills for the conductor area (mirrors the admin exam pages).

const sessionTones: Record<string, BadgeTone> = { active: "green", draft: "gold", closed: "slate" };
const attemptTones: Record<string, BadgeTone> = {
  in_progress: "blue",
  submitted: "green",
  graded: "violet",
  locked: "red",
  expired: "slate"
};

export function SessionStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={sessionTones[status] ?? "slate"} dot className="capitalize">
      {status}
    </Badge>
  );
}

export function AttemptStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={attemptTones[status] ?? "slate"} className="capitalize">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

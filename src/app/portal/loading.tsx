import { PageSkeleton } from "./_components/portal-ui";

export default function PortalLoading() {
  return <PageSkeleton stats={0} cards={2} rows={3} />;
}

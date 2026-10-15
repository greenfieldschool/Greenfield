import { PageSkeleton } from "../_components/portal-ui";

export default function BillingLoading() {
  return <PageSkeleton stats={2} cards={2} rows={3} />;
}

import { PageSkeleton } from "../_components/portal-ui";

export default function AttendanceLoading() {
  return <PageSkeleton stats={3} cards={1} rows={5} />;
}

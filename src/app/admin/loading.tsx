import { CrestLoader } from "@/components/motion/crest-loader";

// Shown inside the staff dashboard while a page is being prepared. Pages with their own loading.tsx (exam tests)
// keep theirs.
export default function AdminLoading() {
  return <CrestLoader className="min-h-[50vh] py-12" />;
}

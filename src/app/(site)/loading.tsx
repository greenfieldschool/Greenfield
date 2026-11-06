import { CrestLoader } from "@/components/motion/crest-loader";

// Shown while a page of the public site is being prepared (only on slower page changes; see CrestLoader).
export default function SiteLoading() {
  return <CrestLoader className="min-h-[60vh] py-16" />;
}

import { ImageResponse } from "next/og";
import { IconArt } from "@/components/app-icon-art";

// Home-screen icons for the app manifest: /app-icon/192, /app-icon/512, and "-maskable" versions with the crest in
// the safe middle area (Android crops icons to a circle or rounded square).
const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.flatMap((s) => [{ size: String(s) }, { size: `${s}-maskable` }]);
}

export async function GET(_req: Request, { params }: { params: { size: string } }) {
  const maskable = params.size.endsWith("-maskable");
  const px = Number(params.size.replace("-maskable", ""));
  if (!SIZES.includes(px)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<IconArt size={px} safe={maskable} />, { width: px, height: px });
}

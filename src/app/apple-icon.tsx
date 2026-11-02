import { ImageResponse } from "next/og";
import { IconArt } from "@/components/app-icon-art";

// The icon an iPhone uses when a parent adds the portal to their home screen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} />, size);
}

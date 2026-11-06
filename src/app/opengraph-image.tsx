import { ImageResponse } from "next/og";
import { MARK_TREE_Y, MARK_VIEWBOX, crestShapes } from "@/components/ui/logo";

// The picture shown when a link to the site is shared (WhatsApp, Facebook, X, iMessage): the crest on school green
// with the name and the school line. Applies to every page that doesn't set its own.
export const alt = "Greenfield School, Lekki, Lagos: creche to secondary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 80px",
          background: "linear-gradient(150deg, #17563E 0%, #0B3D2E 50%, #062519 100%)",
          color: "#FFFFFF"
        }}
      >
        <svg width={240} height={325} viewBox={MARK_VIEWBOX}>
          {crestShapes({ words: false, treeY: MARK_TREE_Y })}
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, letterSpacing: 8, color: "#EDC54C", textTransform: "uppercase" }}>Lekki, Lagos</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 12 }}>Greenfield School</div>
          <div style={{ fontSize: 32, marginTop: 24, color: "#CFE3D9" }}>Creche to secondary</div>
          <div style={{ fontSize: 32, marginTop: 6, color: "#CFE3D9" }}>Nigerian + British curriculum</div>
          <div style={{ display: "flex", marginTop: 40, height: 6, width: 160, background: "#C9961A", borderRadius: 3 }} />
        </div>
      </div>
    ),
    size
  );
}

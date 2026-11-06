import { MARK_TREE_Y, MARK_VIEWBOX, crestShapes } from "@/components/ui/logo";

// The app icon artwork (the Greenfield crest on deep green), shared by app/icon.tsx, app/apple-icon.tsx and the
// home-screen icons in app/app-icon/[size]. Drawn for next/og's ImageResponse, which supports inline SVG, so the
// crest is the same drawing as `LogoMark` (crestShapes is called as a function, not a component).
// `safe` shrinks the crest into the middle 70% so phones can crop the icon to a circle or squircle ("maskable").
export function IconArt({ size, safe = false }: { size: number; safe?: boolean }) {
  const h = Math.round(size * (safe ? 0.6 : 0.8));
  const w = Math.round((h * 164) / 222);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #17563E 0%, #0B3D2E 55%, #062519 100%)"
      }}
    >
      <svg width={w} height={h} viewBox={MARK_VIEWBOX}>
        {crestShapes({ words: false, treeY: MARK_TREE_Y })}
      </svg>
    </div>
  );
}

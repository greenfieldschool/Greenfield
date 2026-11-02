// The app icon artwork (the Greenfield crest on deep green), shared by app/icon.tsx, app/apple-icon.tsx and the
// home-screen icons in app/app-icon/[size]. Drawn for next/og's ImageResponse, which supports inline SVG.
// `safe` shrinks the crest into the middle 70% so phones can crop the icon to a circle or squircle ("maskable").
export function IconArt({ size, safe = false }: { size: number; safe?: boolean }) {
  const crest = Math.round(size * (safe ? 0.52 : 0.66));
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
      <svg width={crest} height={Math.round(crest * 1.1)} viewBox="0 0 40 44">
        <path d="M20 1.5 37 7.2v13.6c0 10.6-7.1 18.5-17 21.7C10.1 39.3 3 31.4 3 20.8V7.2L20 1.5Z" fill="#0B3D2E" />
        <path
          d="M20 1.5 37 7.2v13.6c0 10.6-7.1 18.5-17 21.7C10.1 39.3 3 31.4 3 20.8V7.2L20 1.5Z"
          fill="none"
          stroke="#D4A017"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M20 33V17.5m0 0c0-4.6 3.4-8 8.4-8.2-.2 5-3.6 8.4-8.4 8.2Zm0 4.2c0-3.9-2.9-6.8-7.1-7 .2 4.2 3.1 7.1 7.1 7Z"
          fill="none"
          stroke="#EDC54C"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

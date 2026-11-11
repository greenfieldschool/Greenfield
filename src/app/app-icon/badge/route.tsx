import { ImageResponse } from "next/og";

// The small icon Android shows in the status bar for a phone notification (sw.js "badge"). Android uses only its
// shape (white on transparent), so it's a plain shield with a G cut out rather than the full-colour crest.
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: 96, height: 96, display: "flex" }}>
        <svg width="96" height="96" viewBox="0 0 96 96">
          <defs>
            <mask id="g">
              <rect width="96" height="96" fill="white" />
              <path
                d="M62 36 C59 30 54 27 48 27 C39 27 33 35 33 45 C33 55 39 63 48 63 C56 63 62 58 63 50 H49"
                fill="none"
                stroke="black"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </mask>
          </defs>
          <path d="M48 4 L86 16 V46 C86 68 70 84 48 92 C26 84 10 68 10 46 V16 Z" fill="white" mask="url(#g)" />
        </svg>
      </div>
    ),
    { width: 96, height: 96 }
  );
}

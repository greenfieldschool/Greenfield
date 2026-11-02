import type { MetadataRoute } from "next";

// Lets parents and pupils add the portal to their phone's home screen and open it like an app (full screen, the
// school icon, a green splash). It opens on the portal; the public site still opens in the browser as usual.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Greenfield School Portal",
    short_name: "Greenfield",
    description: "Report cards, fees, messages and exams for Greenfield School families.",
    id: "/portal",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#062519",
    theme_color: "#0B3D2E",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/192-maskable", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/app-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}

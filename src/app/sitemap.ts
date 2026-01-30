import type { MetadataRoute } from "next";

const baseUrl = "https://greenfieldschool.ng";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/about",
    "/academics",
    "/admissions",
    "/contact",
    "/events",
    "/gallery",
    "/news",
    "/privacy",
    "/student-life",
    "/terms"
  ];

  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified
  }));
}

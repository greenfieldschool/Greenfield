import type { MetadataRoute } from "next";
import { getCareerJobSlugs } from "@/lib/careers";

const baseUrl = "https://greenfieldschool.ng";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/about",
    "/academics",
    "/admissions",
    "/careers",
    "/contact",
    "/events",
    "/gallery",
    "/news",
    "/privacy",
    "/student-life",
    "/terms"
  ];

  const careerRoutes = getCareerJobSlugs().map((slug) => `/careers/${slug}`);

  const lastModified = new Date();

  return [...routes, ...careerRoutes].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified
  }));
}

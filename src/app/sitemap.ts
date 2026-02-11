import type { MetadataRoute } from "next";
import { getPublishedCareerJobSlugs } from "@/lib/careers";

const baseUrl = "https://greenfieldschool.ng";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const careerRoutes = (await getPublishedCareerJobSlugs()).map((slug) => `/careers/${slug}`);

  const lastModified = new Date();

  return [...routes, ...careerRoutes].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified
  }));
}

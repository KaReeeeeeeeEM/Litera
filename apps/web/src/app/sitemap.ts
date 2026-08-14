import type { MetadataRoute } from "next";

const origin = "https://litera.almareem.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }> = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/features", changeFrequency: "monthly", priority: 0.9 },
    { path: "/accessibility", changeFrequency: "monthly", priority: 0.8 },
    { path: "/download", changeFrequency: "weekly", priority: 0.9 },
    { path: "/updates", changeFrequency: "weekly", priority: 0.8 },
    { path: "/about", changeFrequency: "monthly", priority: 0.7 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.6 },
    { path: "/contact/email", changeFrequency: "yearly", priority: 0.4 },
  ];

  return pages.map(({ path, ...entry }) => ({ url: `${origin}${path}`, ...entry }));
}

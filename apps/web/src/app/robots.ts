import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account/", "/admin/", "/stakeholder/", "/studio/", "/workspace/", "/login", "/forgot-password", "/reset-password", "/forbidden"],
    },
    sitemap: "https://litera.almareem.com/sitemap.xml",
    host: "https://litera.almareem.com",
  };
}

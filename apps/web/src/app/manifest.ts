import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Litera — Inclusive publishing workspace",
    short_name: "Litera",
    description: "Create responsive, accessible digital learning experiences with visual storyboarding and Swahili-first narration.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f7",
    theme_color: "#a63a2b",
    categories: ["education", "productivity"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

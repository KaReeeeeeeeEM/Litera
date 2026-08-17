import type { PipelineStepSlug, StageSlug } from "@/components/device/device-types";

export type PipelineStepDefinition = { slug: PipelineStepSlug; label: string; dependsOn?: PipelineStepSlug[] };

export const LITERA_PIPELINE: Record<StageSlug, PipelineStepDefinition[]> = {
  extract: [
    { slug: "extract", label: "PDF Extraction" },
    { slug: "metadata", label: "Metadata", dependsOn: ["extract"] },
    { slug: "book-summary", label: "Book Summary", dependsOn: ["metadata"] },
    { slug: "image-filtering", label: "Image Filtering", dependsOn: ["extract"] },
    { slug: "image-segmentation", label: "Image Segmentation", dependsOn: ["image-filtering"] },
    { slug: "image-meaningfulness", label: "Image Meaningfulness", dependsOn: ["image-segmentation"] },
    { slug: "image-cropping", label: "Image Cropping", dependsOn: ["image-segmentation"] },
  ],
  structure: [
    { slug: "page-sectioning", label: "Page Structuring" },
    { slug: "translation", label: "Source-language Normalization", dependsOn: ["page-sectioning"] },
  ],
  storyboard: [
    { slug: "web-rendering", label: "Web Rendering" },
    { slug: "quiz-generation", label: "Quiz Generation", dependsOn: ["web-rendering"] },
    { slug: "glossary", label: "Glossary", dependsOn: ["web-rendering"] },
    { slug: "toc-generation", label: "Table of Contents", dependsOn: ["web-rendering"] },
  ],
  preview: [{ slug: "package-web", label: "Live Reader Preview", dependsOn: ["web-rendering"] }],
  "image-captioning": [
    { slug: "image-captioning", label: "Captioning", dependsOn: ["web-rendering"] },
  ],
  "easy-read": [
    { slug: "text-catalog", label: "Text Catalog", dependsOn: ["web-rendering"] },
    { slug: "easy-read", label: "Easy Read", dependsOn: ["text-catalog"] },
  ],
  language: [
    { slug: "catalog-translation", label: "Catalog Translation" },
    { slug: "image-translation", label: "Image Translation", dependsOn: ["catalog-translation"] },
  ],
  speech: [
    { slug: "tts", label: "Speech Generation" },
    { slug: "word-timestamps", label: "Word Highlighting", dependsOn: ["tts"] },
  ],
  "sign-language": [{ slug: "sign-language-mapping", label: "Signed Media Mapping" }],
  validate: [
    { slug: "package-web", label: "Package Preview" },
    { slug: "accessibility-assessment", label: "Accessibility Assessment", dependsOn: ["package-web"] },
  ],
  export: [{ slug: "package-web", label: "Offline Web Publication" }],
  publish: [{ slug: "publish-github", label: "Publishing to GitHub" }],
};

export function stageStepLabels(stage: StageSlug) { return LITERA_PIPELINE[stage].map(step => step.label); }

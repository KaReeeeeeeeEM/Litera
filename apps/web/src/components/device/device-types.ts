import { Accessibility, AudioLines, BookOpenCheck, FileSearch, Languages, LayoutTemplate, PackageCheck, Video } from "lucide-react";

export type StageSlug = "extract" | "structure" | "storyboard" | "language" | "speech" | "sign-language" | "validate" | "export";

export type DeviceBook = {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  modifiedAt?: string;
  file: Blob;
  currentStage?: StageSlug;
  stageProgress?: Partial<Record<StageSlug, number>>;
  signVideos?: Array<{ id: string; name: string; size: number; file: Blob; target?: string }>;
};

export const stages = [
  { slug: "extract", label: "Extract", description: "Read pages, text, images, and source structure.", icon: FileSearch, color: "var(--stage-extract)" },
  { slug: "structure", label: "Structure", description: "Create meaningful sections and reading order.", icon: BookOpenCheck, color: "var(--stage-structure)" },
  { slug: "storyboard", label: "Storyboard", description: "Arrange responsive layouts and learning blocks.", icon: LayoutTemplate, color: "var(--stage-storyboard)" },
  { slug: "language", label: "Language", description: "Review translations, terminology, and localized media.", icon: Languages, color: "var(--stage-language)" },
  { slug: "speech", label: "Speech", description: "Generate and review narration sentence by sentence.", icon: AudioLines, color: "var(--stage-speech)" },
  { slug: "sign-language", label: "Sign language", description: "Assign signed videos to pages and sections.", icon: Video, color: "var(--stage-sign)" },
  { slug: "validate", label: "Validate", description: "Resolve accessibility and publication quality checks.", icon: Accessibility, color: "var(--stage-validate)" },
  { slug: "export", label: "Export", description: "Package the verified publication for delivery.", icon: PackageCheck, color: "var(--stage-export)" },
] as const;

export function projectProgress(book: DeviceBook) {
  const values = stages.map(({ slug }) => book.stageProgress?.[slug] ?? 0);
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

import {
  Accessibility,
  AudioLines,
  BookOpenCheck,
  Captions,
  FileSearch,
  Glasses,
  Eye,
  Languages,
  LayoutTemplate,
  PackageCheck,
  Rocket,
  Video,
} from "lucide-react";
import { stageStepLabels } from "@/lib/device-pipeline/pipeline-definition";

export type StageSlug =
  | "extract"
  | "structure"
  | "storyboard"
  | "preview"
  | "image-captioning"
  | "easy-read"
  | "language"
  | "speech"
  | "sign-language"
  | "validate"
  | "export"
  | "publish";
export type ReadingLevel = "early" | "middle" | "late";
export type ConversionConfig = {
  preset: "textbook" | "storybook" | "reference" | "custom";
  editingLanguage: string;
  outputLanguages: string[];
  scope: "whole" | "split" | "range";
  sectioningMode: "automatic" | "page" | "chapter";
  pageFrom: string;
  pageTo: string;
  pageParts: string;
  typography: "adapt" | "system" | "custom";
  fontFamily: string;
  extractExercises: boolean;
  generateAnswerSpaces: boolean;
  generateQuestions: boolean;
  questionsPerChapter: number;
  compactOutput: boolean;
  rangeRunMode?: "added" | "all";
};

export type StructuredSection = {
  id: string;
  kind: "heading" | "paragraph" | "list-item" | "image";
  text: string;
  level?: number;
  altText?: string;
  sourceBounds?: { x: number; y: number; w: number; h: number };
};

export type ActivityType =
  | "short-answer"
  | "multiple-choice"
  | "true-false"
  | "fill-blank"
  | "matching"
  | "drawing"
  | "discussion"
  | "no-input";
export type StructuredActivity = {
  id: string;
  pageNumber: number;
  type: ActivityType;
  prompt: string;
  confidence: number;
  responseMode: "text" | "choice" | "drawing" | "discussion" | "none";
  accessibilityHint: string;
  options?: string[];
  inputMode?: "text" | "numeric" | "decimal";
  inputType?: "text" | "time";
  multiline?: boolean;
  answerCount?: number;
  correctAnswers?: string[];
  matchingPairs?: Array<{ left: string; right: string }>;
  noInputReason?: string;
  sourceBounds?: { x: number; y: number; w: number; h: number };
};

export type StructuredPage = {
  pageNumber: number;
  status: "ready";
  structuredAt: string;
  title: string;
  sections: StructuredSection[];
  activities: StructuredActivity[];
};

export type ExtractedLayoutBlock = {
  type: "text" | "image";
  bbox: { x: number; y: number; w: number; h: number };
  text?: string;
  font?: {
    name?: string;
    family?: string;
    weight?: string;
    style?: string;
    size?: number;
    color?: string;
  };
};

export type ExtractedPageAsset = {
  id: string;
  kind: "image";
  blob: Blob;
  bytes?: ArrayBuffer;
  bounds: { x: number; y: number; w: number; h: number };
  /** True when the visual was recovered from the composed page and already
   * contains source lettering; the semantic text remains selectable but is
   * not painted a second time. */
  containsText?: boolean;
};

export type StoryboardBlock = {
  id: string;
  kind: "heading" | "text" | "list" | "image" | "activity";
  content: string;
  order: number;
  accessibleLabel?: string;
  hidden?: boolean;
  /** Offline-safe Tailwind utilities used by the storyboard renderer and editor. */
  className?: string;
  sourceBounds?: { x: number; y: number; w: number; h: number };
  sourceFont?: ExtractedLayoutBlock["font"];
  sourceText?: string;
  assetId?: string;
  visualRole?:
    | "chapter"
    | "title"
    | "section"
    | "callout"
    | "sidebar"
    | "activity"
    | "body";
  styles?: {
    align?: "left" | "center" | "right";
    emphasis?: "normal" | "medium" | "bold";
    size?: "small" | "normal" | "large";
  };
};

export type StoryboardPage = {
  pageNumber: number;
  /** Continuous reader-facing number; pageNumber remains the physical source page. */
  digitalPageNumber?: number;
  status: "ready";
  storyboardedAt: string;
  title: string;
  layout: "reading" | "visual" | "activity";
  sourceAspectRatio?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceMasks?: Array<{ x: number; y: number; w: number; h: number }>;
  fontFamily?: string;
  blocks: StoryboardBlock[];
  html: string;
  renderSource?: "ai" | "local";
  renderFingerprint?: string;
  renderProvider?: string;
  renderModel?: string;
};

export type StoryboardPageRevision = {
  id: string;
  pageNumber: number;
  createdAt: string;
  summary: string;
  page: StoryboardPage;
};

export type TextCatalogEntry = { id: string; text: string; pageNumber: number };
export type LanguageCatalog = {
  language: string;
  sourceLanguage: string;
  entries: TextCatalogEntry[];
  generatedAt: string;
};

export type PipelineStepSlug =
  | "extract"
  | "metadata"
  | "book-summary"
  | "image-filtering"
  | "image-segmentation"
  | "image-meaningfulness"
  | "image-cropping"
  | "page-sectioning"
  | "translation"
  | "web-rendering"
  | "quiz-generation"
  | "image-captioning"
  | "glossary"
  | "toc-generation"
  | "text-catalog"
  | "easy-read"
  | "catalog-translation"
  | "image-translation"
  | "tts"
  | "word-timestamps"
  | "sign-language-mapping"
  | "package-web"
  | "publish-github"
  | "accessibility-assessment";
export type PipelineStepState = {
  status: "queued" | "running" | "complete" | "stopped" | "error";
  progress: number;
  message?: string;
  updatedAt: string;
};
export type SpeechEntry = {
  id: string;
  textId: string;
  language: string;
  pageNumber: number;
  inputText?: string;
  voice?: string;
  speed?: number;
  audio: Blob;
  durationMs?: number;
  words: Array<{ word: string; startMs: number; endMs: number }>;
};
export type ValidationIssue = {
  id: string;
  severity: "error" | "warning";
  category: "structure" | "language" | "media" | "accessibility" | "package";
  message: string;
  pageNumber?: number;
};
export type ValidationReport = {
  generatedAt: string;
  issues: ValidationIssue[];
  passed: boolean;
};
export type ExportArtifact = {
  generatedAt: string;
  name: string;
  mimeType: string;
  blob: Blob;
  pages: number;
  languages: string[];
  format?: "project" | "litera-web" | "scorm" | "webpub" | "epub" | "pnld";
};

export type PublishDeployment = {
  id: string;
  owner: string;
  repository: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  siteUrl: string;
  status: "completed" | "failed";
  createdAt: string;
  fileCount: number;
  error?: string;
};

export type DeviceBook = {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  modifiedAt?: string;
  /** Last time the user opened the book after a pipeline update. */
  lastOpenedAt?: string;
  file: Blob;
  /** Durable source bytes. Desktop WebViews may invalidate persisted Blob handles after reload. */
  sourceBytes?: ArrayBuffer;
  currentStage?: StageSlug;
  stageProgress?: Partial<Record<StageSlug, number>>;
  signVideos?: Array<{
    id: string;
    name: string;
    size: number;
    file: Blob;
    target?: string;
  }>;
  sourceFormat?: "pdf" | "epub" | "webpub" | "package";
  setupComplete?: boolean;
  conversionConfig?: ConversionConfig;
  correctionPrompts?: Array<{
    id: string;
    text: string;
    status: "queued" | "next";
    createdAt: string;
    pageNumber?: number;
    scope?: "page" | "book";
  }>;
  assistantMessages?: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: string;
    pageNumbers?: number[];
    canApply?: boolean;
    instruction?: string;
  }>;
  extractedPages?: Array<{
    number: number;
    status: "extracting" | "ready";
    extractedAt?: string;
    text?: string;
    thumbnail?: Blob;
    thumbnailBytes?: ArrayBuffer;
    width?: number;
    height?: number;
    layoutBlocks?: ExtractedLayoutBlock[];
    assets?: ExtractedPageAsset[];
  }>;
  structuredPages?: StructuredPage[];
  storyboardPages?: StoryboardPage[];
  storyboardPageRevisions?: StoryboardPageRevision[];
  storyboardCss?: string;
  sourceTextCatalog?: TextCatalogEntry[];
  easyReadCatalog?: TextCatalogEntry[];
  /** Shared audience level for Easy Read text and generated visual captions. */
  readingLevel?: ReadingLevel;
  languageCatalogs?: Record<string, LanguageCatalog>;
  speechEntries?: SpeechEntry[];
  /** Per-book override. When absent, Speech uses the default voice from Settings. */
  speechVoice?: string;
  validationReport?: ValidationReport;
  exportArtifact?: ExportArtifact;
  publishConfig?: {
    owner: string;
    repository: string;
    branch: string;
    visibility: "public" | "private";
  };
  publishDeployments?: PublishDeployment[];
  pipelineSteps?: Partial<Record<PipelineStepSlug, PipelineStepState>>;
  metadata?: { title: string; pageCount: number; languageCode: string };
  summary?: string;
  imageCaptions?: Array<{
    imageId: string;
    pageNumber: number;
    caption: string;
  }>;
  /** Pages durably completed by Captioning, including pages with no meaningful visual. */
  captionedPageNumbers?: number[];
  glossary?: Array<{ term: string; definition: string }>;
  tableOfContents?: Array<{ title: string; pageNumber: number; level: number }>;
  totalPages?: number;
  sourceTotalPages?: number;
  pipelineRun?: {
    stage: StageSlug;
    status: "running" | "stopped" | "complete";
    startedAt: string;
  };
  performanceMode?: "eco" | "balanced" | "maximum";
  versions?: Array<{
    id: string;
    number: number;
    createdAt: string;
    summary: string;
    stage: StageSlug;
    stageProgress: Partial<Record<StageSlug, number>>;
  }>;
};

export const defaultConversionConfig: ConversionConfig = {
  preset: "textbook",
  editingLanguage: "",
  outputLanguages: [],
  scope: "whole",
  sectioningMode: "automatic",
  pageFrom: "1",
  pageTo: "",
  pageParts: "",
  typography: "adapt",
  fontFamily: "",
  extractExercises: true,
  generateAnswerSpaces: true,
  generateQuestions: false,
  questionsPerChapter: 3,
  compactOutput: true,
};

export const stageTasks: Record<StageSlug, string[]> = {
  extract: stageStepLabels("extract"),
  structure: stageStepLabels("structure"),
  storyboard: stageStepLabels("storyboard"),
  preview: stageStepLabels("preview"),
  "image-captioning": stageStepLabels("image-captioning"),
  "easy-read": stageStepLabels("easy-read"),
  language: stageStepLabels("language"),
  speech: stageStepLabels("speech"),
  "sign-language": stageStepLabels("sign-language"),
  validate: stageStepLabels("validate"),
  export: stageStepLabels("export"),
  publish: stageStepLabels("publish"),
};

export const stages = [
  {
    slug: "extract",
    label: "Extract",
    description: "Read pages, text, images, and source structure.",
    icon: FileSearch,
    color: "var(--stage-extract)",
  },
  {
    slug: "structure",
    label: "Structure",
    description: "Create meaningful sections and reading order.",
    icon: BookOpenCheck,
    color: "var(--stage-structure)",
  },
  {
    slug: "storyboard",
    label: "Storyboard",
    description: "Arrange responsive layouts and learning blocks.",
    icon: LayoutTemplate,
    color: "var(--stage-storyboard)",
  },
  {
    slug: "image-captioning",
    label: "Captioning",
    description: "Describe meaningful visuals and review decorative images.",
    icon: Captions,
    color: "#7c3aed",
  },
  {
    slug: "easy-read",
    label: "Easy Read",
    description: "Create a simplified, accessible reading alternative.",
    icon: Glasses,
    color: "#db2777",
  },
  {
    slug: "language",
    label: "Language",
    description: "Review translations, terminology, and localized media.",
    icon: Languages,
    color: "var(--stage-language)",
  },
  {
    slug: "speech",
    label: "Speech",
    description: "Generate and review narration sentence by sentence.",
    icon: AudioLines,
    color: "var(--stage-speech)",
  },
  {
    slug: "sign-language",
    label: "Sign language",
    description: "Assign signed videos to pages and sections.",
    icon: Video,
    color: "var(--stage-sign)",
  },
  {
    slug: "validate",
    label: "Validate",
    description: "Resolve accessibility and publication quality checks.",
    icon: Accessibility,
    color: "var(--stage-validate)",
  },
  {
    slug: "preview",
    label: "Preview",
    description: "Optionally review the current accessible book with its reader controls.",
    icon: Eye,
    color: "#2563eb",
  },
  {
    slug: "export",
    label: "Export",
    description: "Package the verified publication for delivery.",
    icon: PackageCheck,
    color: "var(--stage-export)",
  },
  {
    slug: "publish",
    label: "Publish",
    description: "Connect GitHub and deploy the accessible book to GitHub Pages.",
    icon: Rocket,
    color: "#7e22ce",
  },
] as const;

export function projectProgress(book: DeviceBook) {
  const values = stages
    .filter(({ slug }) => slug !== "preview")
    .map(({ slug }) => stageProgressValue(book, slug));
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

/** Preview is a live view of Storyboard output, not a second conversion job. */
export function stageProgressValue(book: DeviceBook, stage: StageSlug) {
  if (stage === "preview")
    return (book.stageProgress?.storyboard ?? 0) === 100 &&
      Boolean(book.storyboardPages?.length)
      ? 100
      : 0;
  return book.stageProgress?.[stage] ?? 0;
}

"use client";

import {
  ArrowUp,
  BookOpen,
  Check,
  Circle,
  CircleStop,
  Gauge,
  GraduationCap,
  History,
  MessageSquareText,
  LoaderCircle,
  PanelRightOpen,
  Play,
  RotateCcw,
  Sparkles,
  Sprout,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type {
  DeviceBook,
  ExtractedLayoutBlock,
  ExtractedPageAsset,
  ReadingLevel,
  SpeechEntry,
  StageSlug,
  StoryboardPage,
  StructuredPage,
  TextCatalogEntry,
} from "@/components/device/device-types";
import {
  projectProgress,
  stageProgressValue,
  incompleteStagePrerequisite,
  stageTasks,
  stages,
} from "@/components/device/device-types";
import { PreviewWorkspace } from "@/components/device/preview-workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/feedback";
import {
  detectActivities,
  linkActivityContinuations,
  structurePageText,
} from "@/lib/device-pipeline/structure-engine";
import {
  createStoryboardPage,
  renderStoryboardHtml,
} from "@/lib/device-pipeline/storyboard-engine";
import { loadProviderRouting } from "@/components/device/device-settings";
import type {
  ProviderId,
  ProviderKeys,
} from "@/components/device/provider-vault";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StructureWorkspace } from "@/components/device/structure-workspace";
import { StoryboardWorkspace } from "@/components/device/storyboard-workspace";
import { LanguageWorkspace } from "@/components/device/language-workspace";
import {
  createFacsimileStoryboardHtml,
  createGeometryStoryboardHtml,
  missingStoryboardAssetIds,
  isStoryboardNoise,
} from "@/lib/device-pipeline/geometry-storyboard-engine";
import {
  captionImagesWithAi,
  completeImageCaptions,
  hydrateStoryboardAssets,
  renderPageWithAi,
  storyboardPaletteIsSafe,
} from "@/lib/device-pipeline/ai-storyboard-engine";
import { uniqueStoryboardSources } from "@/lib/device-pipeline/storyboard-run-policy";
import { inferCorrectAnswers } from "@/lib/device-pipeline/math-content-engine";
import { generateStoryboardAssistantReply } from "@/lib/device-pipeline/storyboard-assistant-engine";
import {
  adaptCatalogForReadingLevel,
  buildTextCatalog,
  translateCatalog,
} from "@/lib/device-pipeline/language-engine";
import {
  isSpeakableText,
  prepareTextForSpeech,
  synthesizeCatalogEntry,
} from "@/lib/device-pipeline/speech-engine";
import { validateBook } from "@/lib/device-pipeline/validation-engine";
import { packageBook } from "@/lib/device-pipeline/export-engine";
import { selectedSourcePages } from "@/lib/device-pipeline/conversion-scope";
import {
  ExportWorkspace,
  PublishWorkspace,
  SignLanguageWorkspace,
  SpeechWorkspace,
  ValidationWorkspace,
} from "@/components/device/delivery-workspaces";

type Props = {
  book: DeviceBook;
  providerConfigured: boolean;
  providerKeys?: ProviderKeys;
  onChange: (book: DeviceBook, summary?: string) => Promise<void>;
  onConfigureProvider: () => void;
};
const bookFonts = [
  "Adapt from source",
  "Atkinson Hyperlegible",
  "Andika",
  "Lexend",
  "Noto Sans",
  "Noto Serif",
  "Source Sans 3",
  "Source Serif 4",
];
export function BookWorkspace({
  book,
  providerConfigured,
  providerKeys,
  onChange,
  onConfigureProvider,
}: Props) {
  const [view, setView] = useState<"overview" | StageSlug>(
    book.currentStage ?? "overview",
  );
  const [assistant, setAssistant] = useState(false);
  const [history, setHistory] = useState(false);
  const [rerenderingPages, setRerenderingPages] = useState<number[]>([]);
  const [storyboardPageReady, setStoryboardPageReady] = useState(false);
  const activeStage =
    view === "overview"
      ? undefined
      : stages.find((stage) => stage.slug === view);
  const runningStage =
    book.pipelineRun?.status === "running" &&
    stageProgressValue(book, book.pipelineRun.stage) < 100
      ? book.pipelineRun.stage
      : undefined;
  const runningProgress = runningStage
    ? (book.stageProgress?.[runningStage] ?? 0)
    : 0;
  const runningStepCount = Object.values(book.pipelineSteps ?? {}).filter(
    (step) => step.status === "running" || step.status === "queued",
  ).length;
  const assistantUnavailable =
    !storyboardPageReady ||
    runningStage === "storyboard" ||
    rerenderingPages.length > 0;
  async function selectStage(stage: StageSlug) {
    const prerequisite = incompleteStagePrerequisite(book, stage);
    if (prerequisite) {
      const label = stages.find((item) => item.slug === prerequisite)?.label;
      toast.warning(`Complete ${label ?? "the previous stage"} before opening this stage.`);
      return;
    }
    if (
      (stage === "export" || stage === "publish") &&
      !book.validationReport?.passed
    ) {
      toast.warning("Pass validation before exporting or publishing.");
      return;
    }
    setView(stage);
    await onChange(
      { ...book, currentStage: stage },
      `Opened ${stages.find((item) => item.slug === stage)?.label}`,
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[12rem_minmax(0,1fr)] overflow-hidden bg-background">
      <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-muted/10 p-3">
        <Button
          className="mb-3 w-full justify-start"
          onClick={() => setView("overview")}
          variant={view === "overview" ? "secondary" : "ghost"}
        >
          <BookOpen data-icon="inline-start" />
          Overview
        </Button>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="grid gap-1 pr-2">
            {stages.map((stage, index) => {
              const progress = stageProgressValue(book, stage.slug);
              const prerequisite = incompleteStagePrerequisite(book, stage.slug);
              const disabled =
                Boolean(prerequisite) ||
                ((stage.slug === "export" || stage.slug === "publish") &&
                  !book.validationReport?.passed);
              const isRunning = runningStage === stage.slug;
              return (
                <button
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-400 hover:bg-primary/10",
                    view === stage.slug && "bg-primary/10",
                    disabled &&
                      "cursor-not-allowed opacity-45 hover:bg-transparent",
                  )}
                  key={stage.slug}
                  aria-disabled={disabled}
                  aria-label={
                    prerequisite
                      ? `${stage.label}, locked until ${stages.find((item) => item.slug === prerequisite)?.label} is complete`
                      : stage.label
                  }
                  disabled={disabled}
                  onClick={() => void selectStage(stage.slug)}
                  type="button"
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                      isRunning && "bg-background shadow-sm",
                    )}
                    style={{ borderColor: stage.color, color: stage.color }}
                  >
                    {isRunning ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin motion-reduce:animate-none"
                      />
                    ) : progress === 100 ? (
                      <Check className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {stage.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {isRunning
                        ? `Running · ${progress}%`
                        : prerequisite
                          ? `Complete ${stages.find((item) => item.slug === prerequisite)?.label}`
                          : `${progress}%`}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </ScrollArea>
        {runningStage ? (
          <div
            aria-live="polite"
            className="mt-2 flex items-center gap-2.5 border-t px-2 pt-3"
          >
            <div
              aria-label={`${runningProgress}% complete`}
              className="relative grid size-8 shrink-0 place-items-center rounded-full"
              role="progressbar"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={runningProgress}
              style={{
                background: `conic-gradient(var(--primary) ${runningProgress * 3.6}deg, var(--muted) 0deg)`,
              }}
            >
              <span className="grid size-6 place-items-center rounded-full bg-background text-[10px] font-bold text-primary">
                {Math.max(1, runningStepCount)}
              </span>
            </div>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3 animate-spin text-primary motion-reduce:animate-none"
                />
                Task running
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {stages.find((stage) => stage.slug === runningStage)?.label} ·{" "}
                {runningProgress}%
              </span>
            </span>
          </div>
        ) : null}
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="z-20 flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-5 backdrop-blur">
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-semibold">
              {book.name.replace(/\.[^.]+$/, "")}
            </p>
            <p className="text-xs text-muted-foreground">
              {view === "overview" ? "Book overview" : activeStage?.label}
            </p>
          </div>
          {view === "storyboard" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    disabled={assistantUnavailable}
                    onClick={() => setAssistant(true)}
                    size="sm"
                    variant="outline"
                  >
                    <PanelRightOpen data-icon="inline-start" />
                    Assistant
                  </Button>
                </span>
              </TooltipTrigger>
              {assistantUnavailable ? (
                <TooltipContent>
                  Wait until the current page has finished rendering.
                </TooltipContent>
              ) : null}
            </Tooltip>
          ) : null}
          <SearchableSelect
            className="w-48"
            onValueChange={(font) =>
              void onChange(
                {
                  ...book,
                  conversionConfig: {
                    ...book.conversionConfig!,
                    typography:
                      font === "Adapt from source" ? "adapt" : "custom",
                    fontFamily: font === "Adapt from source" ? "" : font,
                  },
                },
                `Changed book font to ${font}`,
              )
            }
            options={bookFonts.map((font) => ({ label: font, value: font }))}
            placeholder="Search book fonts…"
            value={
              book.conversionConfig?.typography === "adapt"
                ? "Adapt from source"
                : book.conversionConfig?.fontFamily || "Atkinson Hyperlegible"
            }
          />
          <Button
            onClick={() => setHistory(true)}
            size="icon-sm"
            variant="outline"
          >
            <History />
            <span className="sr-only">Version history</span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 md:p-8">
          {view === "overview" ? (
            <Overview book={book} onSelect={selectStage} />
          ) : activeStage ? (
            <StagePage
              active={activeStage.slug}
              book={book}
              onChange={onChange}
              onConfigureProvider={onConfigureProvider}
              onSelectStage={selectStage}
              providerConfigured={providerConfigured}
              providerKeys={providerKeys}
              rerenderingPages={rerenderingPages}
              onRerenderStateChange={setRerenderingPages}
              onStoryboardPageReadyChange={setStoryboardPageReady}
            />
          ) : null}
        </div>
      </section>
      <StoryboardAssistant
        book={book}
        onChange={onChange}
        onOpenChange={setAssistant}
        open={assistant}
        providerKeys={providerKeys}
        onRerenderStateChange={setRerenderingPages}
      />
      <VersionHistory
        book={book}
        onChange={onChange}
        onOpenChange={setHistory}
        open={history}
      />
    </div>
  );
}

function Overview({
  book,
  onSelect,
}: {
  book: DeviceBook;
  onSelect: (stage: StageSlug) => Promise<void>;
}) {
  return (
    <div className="mx-auto max-w-6xl page-transition">
      <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary">Local workspace</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Publishing pipeline
          </h1>
          <p className="mt-2 text-muted-foreground">
            Open a stage to see its pages, controls, outputs, and history.
          </p>
        </div>
        <div className="min-w-64">
          <div className="mb-2 flex justify-between text-sm">
            <span>Overall completion</span>
            <strong>{projectProgress(book)}%</strong>
          </div>
          <Progress value={projectProgress(book)} />
        </div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {stages.map((stage, index) => {
          const progress = stageProgressValue(book, stage.slug);
          const disabled =
            (stage.slug === "preview" && progress < 100) ||
            ((stage.slug === "export" || stage.slug === "publish") &&
              !book.validationReport?.passed);
          return (
            <Card
              aria-disabled={disabled}
              className={cn(
                "cursor-pointer transition-colors duration-400 hover:border-primary/30",
                disabled && "cursor-not-allowed opacity-50",
              )}
              key={stage.slug}
              onClick={() => !disabled && void onSelect(stage.slug)}
            >
              <CardHeader className="flex-row items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                  <stage.icon style={{ color: stage.color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>
                      {String(index + 1).padStart(2, "0")} · {stage.label}
                    </CardTitle>
                    <Badge variant={progress === 100 ? "secondary" : "outline"}>
                      {progress === 100
                        ? "Complete"
                        : progress
                          ? "In progress"
                          : "Not started"}
                    </Badge>
                  </div>
                  <CardDescription className="mt-2">
                    {stage.description}
                  </CardDescription>
                  <Progress className="mt-4 h-1.5" value={progress} />
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StagePage({
  active,
  book,
  onChange,
  onConfigureProvider,
  onSelectStage,
  providerConfigured,
  providerKeys,
  rerenderingPages,
  onRerenderStateChange,
  onStoryboardPageReadyChange,
}: {
  active: StageSlug;
  book: DeviceBook;
  providerConfigured: boolean;
  providerKeys?: ProviderKeys;
  rerenderingPages: number[];
  onRerenderStateChange: (pages: number[]) => void;
  onStoryboardPageReadyChange: (ready: boolean) => void;
  onConfigureProvider: () => void;
  onSelectStage: (stage: StageSlug) => Promise<void>;
  onChange: Props["onChange"];
}) {
  const stage = stages.find((item) => item.slug === active)!;
  const [processingStage, setProcessingStage] = useState<StageSlug>();
  const cancelled = useRef(false);
  const runController = useRef<AbortController | undefined>(undefined);
  const running = processingStage === active;
  const anotherStageRunning = Boolean(processingStage && !running);
  const progress =
    active === "extract"
      ? extractionProgress(book)
      : stageProgressValue(book, active);
  const prerequisite = incompleteStagePrerequisite(book, active);
  const prerequisiteBlocked = Boolean(prerequisite);
  async function run() {
    if (active === "preview") return;
    if (anotherStageRunning) {
      toast.warning(
        `${stages.find((item) => item.slug === processingStage)?.label ?? "Another stage"} is already running.`,
      );
      return;
    }
    if (prerequisite) {
      toast.warning(
        `Complete ${stages.find((item) => item.slug === prerequisite)?.label ?? "the previous stage"} first.`,
      );
      return;
    }
    if (
      !providerConfigured &&
      active !== "extract" &&
      active !== "structure" &&
      active !== "storyboard" &&
      active !== "easy-read" &&
      active !== "language" &&
      active !== "validate" &&
      active !== "export" &&
      active !== "sign-language"
    )
      return onConfigureProvider();
    if (active === "structure") {
      const extractedPages =
        book.extractedPages?.filter((page) => page.status === "ready") ?? [];
      if (!extractedPages.length) {
        toast.error(
          "Run Extraction before Structure so there are pages to section.",
        );
        return;
      }
      cancelled.current = false;
      runController.current = new AbortController();
      setProcessingStage(active);
      try {
        const repeatAll = book.conversionConfig?.rangeRunMode === "all";
        let existingStructured = repeatAll
          ? []
          : (book.structuredPages ?? []);
        const existingStructuredNumbers = new Set(
          existingStructured.map((page) => page.pageNumber),
        );
        let pagesToStructure = repeatAll
          ? extractedPages
          : extractedPages.filter(
              (page) => !existingStructuredNumbers.has(page.number),
            );
        if (!pagesToStructure.length) {
          existingStructured = [];
          pagesToStructure = extractedPages;
          toast.info("Re-sectioning every selected page.");
        }
        let working: DeviceBook = {
          ...book,
          structuredPages: existingStructured,
          stageProgress: {
            ...book.stageProgress,
            structure: Math.round(
              (existingStructured.length / extractedPages.length) * 100,
            ),
          },
          pipelineRun: {
            stage: "structure",
            status: "running",
            startedAt: new Date().toISOString(),
          },
        };
        await onChange(working, "Started page structure");
        for (
          let index = 0;
          index < pagesToStructure.length && !cancelled.current;
          index += 1
        ) {
          const page = pagesToStructure[index]!;
          const structuredPage = structurePageText(
            page.number,
            page.text ?? "",
            page.layoutBlocks,
          );
          const structuredPages = linkActivityContinuations([
            ...(working.structuredPages ?? []).filter(
              (candidate) => candidate.pageNumber !== structuredPage.pageNumber,
            ),
            structuredPage,
          ].sort((a, b) => a.pageNumber - b.pageNumber), extractedPages);
          const structureProgress = Math.round(
            (structuredPages.length / extractedPages.length) * 100,
          );
          working = {
            ...working,
            structuredPages,
            stageProgress: {
              ...working.stageProgress,
              structure: structureProgress,
            },
          };
          await onChange(working, `Structured page ${page.number}`);
          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              performanceDelay(working.performanceMode),
            ),
          );
        }
        const linkedStructuredPages = linkActivityContinuations(
          working.structuredPages ?? [],
          extractedPages,
        );
        working = {
          ...working,
          structuredPages: linkedStructuredPages,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["page-sectioning", "translation"],
            cancelled.current ? "stopped" : "complete",
          ),
          pipelineRun: {
            ...working.pipelineRun!,
            status: cancelled.current ? "stopped" : "complete",
          },
        };
        await onChange(
          working,
          cancelled.current
            ? "Stopped page structure"
            : "Completed page structure",
        );
        if (!cancelled.current)
          toast.complete(
            "Every extracted page now has a persisted reading structure.",
          );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Page structure failed.",
        );
      } finally {
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "storyboard") {
      const structuredPages = uniqueStoryboardSources(book.structuredPages);
      if (!structuredPages.length) {
        toast.error(
          "Run Structure before Storyboard so there are semantic pages to arrange.",
        );
        return;
      }
      cancelled.current = false;
      const controller = new AbortController();
      runController.current = controller;
      setProcessingStage(active);
      let working = book;
      try {
        const repeatAll = book.conversionConfig?.rangeRunMode === "all";
        let existingStoryboard = repeatAll
          ? []
          : (book.storyboardPages ?? []);
        const existingStoryboardNumbers = new Set(
          existingStoryboard.map((page) => page.pageNumber),
        );
        let pagesToRender = repeatAll
          ? structuredPages
          : structuredPages.filter(
              (page) => !existingStoryboardNumbers.has(page.pageNumber),
            );
        if (!pagesToRender.length) {
          existingStoryboard = [];
          pagesToRender = structuredPages;
          toast.info("Re-rendering every selected storyboard page.");
        }
        const tableOfContents = buildTableOfContents({
          ...book,
          structuredPages,
        });
        // Contents depend on final digital folios, so render them only after
        // all ordinary pages have their stable positions.
        const ordinaryPages = pagesToRender.filter(
          (page) => !isTableOfContentsPage(page),
        );
        const contentsPagesToRender = pagesToRender.filter((page) =>
          isTableOfContentsPage(page),
        );
        const visionProvider =
          providerConfigured && providerKeys
            ? selectVisionProvider(providerKeys)
            : undefined;
        const publicationPalette = await storyboardPhase(
          "Sampling the book colour system",
          () =>
            derivePublicationPalette(book, structuredPages, controller.signal),
        );
        working = {
          ...book,
          storyboardPages: existingStoryboard,
          stageProgress: {
            ...book.stageProgress,
            storyboard: Math.round(
              (existingStoryboard.length / structuredPages.length) * 100,
            ),
          },
          pipelineSteps: queuePipelineSteps(book.pipelineSteps, [
            "web-rendering",
            "quiz-generation",
            "glossary",
            "toc-generation",
          ]),
          pipelineRun: {
            stage: "storyboard",
            status: "running",
            startedAt: new Date().toISOString(),
          },
        };
        await storyboardPhase("Starting Storyboard", () =>
          onChange(working, "Started page storyboarding"),
        );
        const concurrency =
          working.performanceMode === "maximum" ? 2 : 1;
        // Persist each finished page. A batched write made small/split
        // conversions appear frozen at 0% until the final page completed and
        // also discarded every completed page when a provider request was
        // stopped mid-wave.
        const persistenceBatchSize =
          working.performanceMode === "eco"
            ? 3
            : working.performanceMode === "maximum"
              ? 4
              : 2;
        let persistChain = Promise.resolve();
        const renderWave = async (pages: StructuredPage[]) =>
          processWithBoundedConcurrency(
            pages,
            concurrency,
            async (sourcePage) => {
              let storyboardPage: Awaited<ReturnType<typeof renderStoryboardSourcePage>>;
              try {
                // A fixed 18s budget was tight enough that an asset-heavy page
                // (dozens of images needing blob-URL conversion and layout
                // work) could exceed it under batch load - even though the
                // very same render finishes fine in isolation (the
                // single-page repair flow below already budgets 30s with no
                // competing pages). Once this timed out, the catch below
                // silently recovered with assets stripped entirely, so the
                // page kept its text but lost every picture with no visible
                // error anywhere. Scale the budget with how much this
                // specific page actually has to render instead of using one
                // size for every page.
                const pageTimeoutMs = Math.min(
                  90_000,
                  30_000 + (sourcePage.activities.length + (book.extractedPages?.find((p) => p.number === sourcePage.pageNumber)?.assets?.length ?? 0)) * 500,
                );
                storyboardPage = await withStoryboardPageTimeout(
                  renderStoryboardSourcePage({
                    book,
                    sourcePage,
                    structuredPages,
                    tableOfContents,
                    publicationPalette,
                    providerKeys: providerConfigured ? providerKeys : undefined,
                    visionProvider,
                    signal: controller.signal,
                  }),
                  pageTimeoutMs,
                  controller.signal,
                );
              } catch (error) {
                if (isAbortError(error)) throw error;
                const extractedPage = book.extractedPages?.find(
                  (page) => page.number === sourcePage.pageNumber,
                );
                if (!extractedPage) throw error;
                const accent = publicationPalette.find((color) =>
                  /^#[0-9a-f]{6}$/i.test(color),
                ) ?? "#02acaf";
                const digitalPageNumber =
                  structuredPages.findIndex(
                    (page) => page.pageNumber === sourcePage.pageNumber,
                  ) + 1;
                const recoveredPage = await createGeometryStoryboardPage(
                  sourcePage,
                  { ...extractedPage, assets: [] },
                  {
                    fontFamily: book.conversionConfig?.fontFamily || undefined,
                    digitalPageNumber,
                    decoration: { top: "#ffffff", bottom: "#ffffff", accent },
                  },
                );
                storyboardPage = { ...recoveredPage, digitalPageNumber };
                // This recovery path strips every image on the page as a
                // safe fallback so the whole batch can keep going - but that
                // previously happened with no visible trace anywhere, so a
                // genuinely slow-but-otherwise-fine page (usually one with
                // many images) silently lost every picture with only a
                // "Rendered" status to look at. Surface it so this is
                // something to notice and re-render, not a permanent,
                // invisible gap.
                toast.warning(
                  `Page ${sourcePage.pageNumber} kept its text but lost its images while rendering (${error instanceof Error ? error.message : "an error occurred"}). Use "Re-render page" on it once the batch finishes.`,
                );
              }
              controller.signal.throwIfAborted();
              persistChain = persistChain.then(async () => {
                const storyboardPages = [
                  ...(working.storyboardPages ?? []).filter(
                    (page) => page.pageNumber !== storyboardPage.pageNumber,
                  ),
                  storyboardPage,
                ].sort((a, b) => a.pageNumber - b.pageNumber);
                const storyboardProgress = Math.round(
                  (storyboardPages.length / structuredPages.length) * 100,
                );
                working = {
                  ...working,
                  storyboardPages,
                  stageProgress: {
                    ...working.stageProgress,
                    storyboard: storyboardProgress,
                  },
                };
                const shouldPersist =
                  storyboardPages.length % persistenceBatchSize === 0 ||
                  storyboardPages.length === structuredPages.length;
                if (shouldPersist)
                  await onChange(
                    working,
                    `Storyboarded ${storyboardPages.length} pages`,
                  );
              });
              await persistChain;
              await yieldToBrowser();
            },
            controller.signal,
          );
        await renderWave(ordinaryPages);
        if (!cancelled.current) await renderWave(contentsPagesToRender);
        await persistChain;
        const storyboardCss =
          cancelled.current || !working.storyboardPages?.length
            ? working.storyboardCss
            : await storyboardPhase("Compiling storyboard styles", () =>
                compileStoryboardTailwindCss(
                  working.storyboardPages!,
                  controller.signal,
                ),
              );
        working = {
          ...working,
          storyboardCss,
          stageProgress: { ...working.stageProgress, storyboard: 100 },
          pipelineSteps: runPipelineStep(
            completePipelineSteps(
              working.pipelineSteps,
              ["web-rendering", "quiz-generation"],
              cancelled.current ? "stopped" : "complete",
            ),
            "glossary",
            "Building glossary",
          ),
        };
        working = {
          ...working,
          glossary: buildGlossary(working),
          tableOfContents,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["glossary", "toc-generation"],
            cancelled.current ? "stopped" : "complete",
          ),
          pipelineRun: {
            ...working.pipelineRun!,
            status: cancelled.current ? "stopped" : "complete",
          },
        };
        await onChange(
          working,
          cancelled.current
            ? "Stopped storyboarding"
            : "Completed storyboarding",
        );
        if (!cancelled.current)
          toast.complete(
            "Every page was rendered as a source-faithful accessible layout.",
          );
      } catch (error) {
        working = {
          ...working,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["web-rendering", "quiz-generation", "glossary", "toc-generation"],
            "stopped",
          ),
          pipelineRun: {
            stage: "storyboard",
            status: "stopped",
            startedAt: working.pipelineRun?.startedAt ?? new Date().toISOString(),
          },
        };
        await onChange(working, "Storyboard stopped before completion");
        if (!isAbortError(error))
          toast.error(
            error instanceof Error ? error.message : "Storyboarding failed.",
          );
      } finally {
        if (runController.current === controller)
          runController.current = undefined;
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "image-captioning") {
      if (!book.storyboardPages?.length) {
        toast.error("Run Storyboard before Captioning.");
        return;
      }
      if (!providerKeys) {
        onConfigureProvider();
        return;
      }
      cancelled.current = false;
      const controller = new AbortController();
      runController.current = controller;
      setProcessingStage(active);
      let working = book;
      try {
        const allPages = book.storyboardPages;
        const completedNumbers = new Set(book.captionedPageNumbers ?? []);
        const pages = allPages.filter((page) => !completedNumbers.has(page.pageNumber));
        if (!pages.length) {
          toast.info("Every storyboard page has already been captioned.");
          return;
        }
        const captionLanguage =
          book.conversionConfig?.editingLanguage &&
          book.conversionConfig.editingLanguage !== "auto"
            ? book.conversionConfig.editingLanguage
            : (book.metadata?.languageCode ?? "en");
        const captionProvider = selectVisionProvider(providerKeys);
        working = {
          ...book,
          imageCaptions: book.imageCaptions ?? [],
          captionedPageNumbers: [...completedNumbers],
          stageProgress: {
            ...book.stageProgress,
            "image-captioning": Math.round((completedNumbers.size / allPages.length) * 100),
          },
          pipelineSteps: runPipelineStep(
            book.pipelineSteps,
            "image-captioning",
            "Describing meaningful visuals",
          ),
          pipelineRun: {
            stage: "image-captioning",
            status: "running",
            startedAt: new Date().toISOString(),
          },
        };
        await onChange(working, "Started Captioning");
        const captionConcurrency =
          working.performanceMode === "eco"
            ? 2
            : working.performanceMode === "maximum"
              ? 8
              : 4;
        // Persisting a book clones its Blob-backed assets. Checkpoint several
        // completed pages together so captioning does not spend most of its
        // time repeatedly writing the same large book record.
        const captionCheckpointSize = captionConcurrency * 2;
        let fallbackCaptionCount = 0;
        for (let index = 0; index < pages.length; index += captionCheckpointSize) {
          const batch = pages.slice(index, index + captionCheckpointSize);
          const results = await mapWithConcurrency(
            batch,
            captionConcurrency,
            async (page) => {
              const storedPage = book.extractedPages?.find(
                (candidate) => candidate.number === page.pageNumber,
              );
              if (!storedPage) return { page, captions: [] };
              const [extractedPage, thumbnail] = await Promise.all([
                ensurePageGeometry(book, storedPage),
                readablePageImage(book, storedPage),
              ]);
              const requestedIds = new Set(
                page.blocks
                  .filter((block) => block.kind === "image" && block.assetId)
                  .map((block) => block.assetId!),
              );
              const savedAssets = storedPage.assets ?? [];
              const savedIds = new Set(savedAssets.map((asset) => asset.id));
              const assets = [...requestedIds].every((id) => savedIds.has(id))
                ? savedAssets
                : await ensurePageAssets(book, {
                    ...extractedPage,
                    thumbnail,
                  });
              const captionAssets = assets.filter(
                (asset) =>
                  isMeaningfulStoryboardAsset(asset) &&
                  (requestedIds.has(asset.id) || !asset.containsText) &&
                  !isDecorativePageAsset(
                    asset,
                    extractedPage.width ?? 612,
                    extractedPage.height ?? 792,
                  ),
              );
              let captions;
              try {
                captions = await withProviderRetry(
                  () =>
                    captionImagesWithAi({
                      pageImage: thumbnail,
                      assets: captionAssets,
                      pageText: extractedPage.text,
                      language: captionLanguage,
                      readingLevel: book.readingLevel ?? "middle",
                      keys: providerKeys,
                      provider: captionProvider,
                      signal: controller.signal,
                    }),
                  controller.signal,
                );
              } catch (error) {
                if (isAbortError(error)) throw error;
                captions = completeImageCaptions(
                  [],
                  captionAssets,
                  extractedPage.text,
                  captionLanguage,
                );
                fallbackCaptionCount += captions.length;
              }
              return { page, captions };
            },
            controller.signal,
          );
          for (const { page, captions } of results) {
          const captionedPage = applyImageCaptions(page, captions);
          const persistedCaptions = captions.map((caption) => ({
            ...caption,
            caption: cleanImageCaption(caption.caption),
            pageNumber: page.pageNumber,
          }));
          const captionedPageNumbers = [
            ...new Set([...(working.captionedPageNumbers ?? []), page.pageNumber]),
          ];
          working = {
            ...working,
            storyboardPages: (working.storyboardPages ?? []).map((candidate) =>
              candidate.pageNumber === page.pageNumber
                ? captionedPage
                : candidate,
            ),
            imageCaptions: [
              ...(working.imageCaptions ?? []).filter(
                (caption) => caption.pageNumber !== page.pageNumber,
              ),
              ...persistedCaptions,
            ],
            captionedPageNumbers,
            stageProgress: {
              ...working.stageProgress,
              "image-captioning": Math.round(
                (captionedPageNumbers.length /
                  allPages.length) * 100,
              ),
            },
          };
          }
          await onChange(
            working,
            `Captioned visuals through page ${results.at(-1)?.page.pageNumber ?? index + 1}`,
          );
        }
        working = {
          ...working,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["image-captioning"],
            "complete",
          ),
          pipelineRun: { ...working.pipelineRun!, status: "complete" },
        };
        await onChange(working, "Completed Captioning");
        if (fallbackCaptionCount)
          toast.warning(
            `Captioning completed. ${fallbackCaptionCount} visual descriptions used source-context fallbacks and can be reviewed.`,
          );
        else toast.complete("Meaningful visuals now have persisted captions.");
      } catch (error) {
        working = {
          ...working,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["image-captioning"],
            "stopped",
          ),
          pipelineRun: {
            stage: "image-captioning",
            status: "stopped",
            startedAt: working.pipelineRun?.startedAt ?? new Date().toISOString(),
          },
        };
        await onChange(working, "Image captioning stopped before completion");
        if (!isAbortError(error)) toast.error(
          error instanceof Error ? error.message : "Image captioning failed.",
        );
      } finally {
        if (runController.current === controller) runController.current = undefined;
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "easy-read") {
      if (!book.storyboardPages?.length) {
        toast.error("Run Storyboard before Easy Read.");
        return;
      }
      const controller = new AbortController();
      runController.current = controller;
      setProcessingStage(active);
      try {
        let working: DeviceBook = {
          ...book,
          stageProgress: { ...book.stageProgress, "easy-read": 0 },
          pipelineSteps: runPipelineStep(
            book.pipelineSteps,
            "text-catalog",
            "Building accessible text catalog",
          ),
          pipelineRun: {
            stage: "easy-read",
            status: "running",
            startedAt: new Date().toISOString(),
          },
        };
        await onChange(working, "Started Easy Read");
        const captionCatalog = (working.imageCaptions ?? []).flatMap((caption) => {
          const text = caption.caption.replace(/\s+/g, " ").trim();
          return text
            ? [{ id: `caption-${caption.imageId}`, text, pageNumber: caption.pageNumber }]
            : [];
        });
        if (!captionCatalog.length) {
          toast.error("Run Captioning before Easy Read so image descriptions can be simplified.");
          return;
        }
        const readingLevel = book.readingLevel ?? "middle";
        let easyReadCatalog = buildEasyReadCatalog(captionCatalog, readingLevel);
        working = {
          ...working,
          easyReadCatalog,
          stageProgress: { ...working.stageProgress, "easy-read": 50 },
          pipelineSteps: runPipelineStep(
            completePipelineSteps(
              working.pipelineSteps,
              ["text-catalog"],
              "complete",
            ),
            "easy-read",
            "Creating simplified reading text",
          ),
        };
        await onChange(working, "Built Easy Read source catalog");
        const language =
          book.conversionConfig?.editingLanguage &&
          book.conversionConfig.editingLanguage !== "auto"
            ? book.conversionConfig.editingLanguage
            : (book.metadata?.languageCode ?? "en");
        if (providerKeys) {
          try {
            const provider = selectTranslationProvider(providerKeys);
            easyReadCatalog = await withProviderRetry(
              () => adaptCatalogForReadingLevel({
                entries: captionCatalog,
                language,
                level: readingLevel,
                keys: providerKeys,
                provider,
                signal: controller.signal,
                onProgress: async (completed, total) => {
                  const progress = 50 + Math.round((completed / Math.max(1, total)) * 48);
                  working = {
                    ...working,
                    stageProgress: {
                      ...working.stageProgress,
                      "easy-read": progress,
                    },
                  };
                  await onChange(
                    working,
                    `Easy Read adapted ${completed} of ${total} unique passages`,
                  );
                },
              }),
              controller.signal,
            );
          } catch (error) {
            if (isAbortError(error)) throw error;
            toast.warning(
              "Easy Read used the on-device fallback. You can rerun it when an AI provider is available.",
            );
          }
        }
        working = {
          ...working,
          easyReadCatalog,
          stageProgress: { ...working.stageProgress, "easy-read": 100 },
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["easy-read"],
            "complete",
          ),
          pipelineRun: { ...working.pipelineRun!, status: "complete" },
        };
        await onChange(working, "Completed Easy Read");
        toast.complete("Easy Read image captions are ready for review.");
      } catch (error) {
        if (!isAbortError(error))
          toast.error(error instanceof Error ? error.message : "Easy Read failed.");
      } finally {
        if (runController.current === controller) runController.current = undefined;
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "language") {
      if ((book.stageProgress?.["easy-read"] ?? 0) < 100) {
        toast.error("Run Easy Read before Language.");
        return;
      }
      const sourceCatalog = buildTextCatalog(book);
      if (!sourceCatalog.length) {
        toast.error(
          "Run Storyboard before Language so Litera can build the stable text catalog.",
        );
        return;
      }
      const sourceLanguage =
        book.conversionConfig?.editingLanguage &&
        book.conversionConfig.editingLanguage !== "auto"
          ? book.conversionConfig.editingLanguage
          : (book.metadata?.languageCode ?? "en");
      const targets = [
        ...new Set(book.conversionConfig?.outputLanguages ?? []),
      ].filter(
        (language) => baseLanguage(language) !== baseLanguage(sourceLanguage),
      );
      if (targets.length && !providerKeys) {
        toast.error(
          "Configure an encrypted provider key before translating the book.",
        );
        onConfigureProvider();
        return;
      }
      cancelled.current = false;
      const controller = new AbortController();
      runController.current = controller;
      setProcessingStage(active);
      try {
        const provider = targets.length
          ? selectTranslationProvider(providerKeys!)
          : undefined;
        const sourceLanguageCatalog = {
          language: sourceLanguage,
          sourceLanguage,
          entries: sourceCatalog,
          generatedAt: new Date().toISOString(),
        };
        let working: DeviceBook = {
          ...book,
          sourceTextCatalog: sourceCatalog,
          languageCatalogs: { [sourceLanguage]: sourceLanguageCatalog },
          stageProgress: {
            ...book.stageProgress,
            language: targets.length ? 0 : 100,
          },
          pipelineRun: {
            stage: "language",
            status: "running",
            startedAt: new Date().toISOString(),
          },
        };
        await onChange(working, "Built source text catalog");
        for (
          let languageIndex = 0;
          languageIndex < targets.length;
          languageIndex += 1
        ) {
          const language = targets[languageIndex]!;
          await translateCatalog({
            entries: sourceCatalog,
            sourceLanguage,
            targetLanguage: language,
            keys: providerKeys!,
            provider: provider!,
            signal: controller.signal,
            onBatch: async (entries) => {
              const completed =
                languageIndex * sourceCatalog.length + entries.length;
              const languageProgress = Math.round(
                (completed / (sourceCatalog.length * targets.length)) * 100,
              );
              working = {
                ...working,
                languageCatalogs: {
                  ...working.languageCatalogs,
                  [language]: {
                    language,
                    sourceLanguage,
                    entries,
                    generatedAt: new Date().toISOString(),
                  },
                },
                stageProgress: {
                  ...working.stageProgress,
                  language: languageProgress,
                },
              };
              await onChange(
                working,
                `Translated ${entries.length} entries to ${language}`,
              );
            },
          });
        }
        working = {
          ...working,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["catalog-translation", "image-translation"],
            "complete",
          ),
          pipelineRun: { ...working.pipelineRun!, status: "complete" },
          stageProgress: { ...working.stageProgress, language: 100 },
        };
        await onChange(working, "Completed language catalogs");
        toast.complete(
          "Every selected language now has a persisted, editable text catalog.",
        );
      } catch (error) {
        if (!isAbortError(error))
          toast.error(
            error instanceof Error ? error.message : "Translation failed.",
          );
      } finally {
        if (runController.current === controller)
          runController.current = undefined;
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "speech") {
      if ((book.stageProgress?.language ?? 0) < 100) {
        toast.error("Complete Language before running Speech.");
        return;
      }
      if (!providerKeys) {
        toast.error("Configure a speech-capable provider first.");
        onConfigureProvider();
        return;
      }
      const sourceLanguage =
        book.conversionConfig?.editingLanguage &&
        book.conversionConfig.editingLanguage !== "auto"
          ? book.conversionConfig.editingLanguage
          : (book.metadata?.languageCode ?? "en");
      const currentSourceEntries = buildTextCatalog(book);
      const storedCatalogs = Object.values(book.languageCatalogs ?? {});
      const catalogs = storedCatalogs.some(
        (catalog) => baseLanguage(catalog.language) === baseLanguage(sourceLanguage),
      )
        ? storedCatalogs.map((catalog) =>
            baseLanguage(catalog.language) === baseLanguage(sourceLanguage)
              ? { ...catalog, entries: currentSourceEntries }
              : catalog,
          )
        : [
            ...storedCatalogs,
            {
              language: sourceLanguage,
              sourceLanguage,
              entries: currentSourceEntries,
              generatedAt: new Date().toISOString(),
            },
          ];
      if (!catalogs.length) {
        toast.error(
          "Run Language before Speech so narration follows the translated catalogs.",
        );
        return;
      }
        const routing = loadProviderRouting();
        const provider = selectSpeechProvider(providerKeys);
        const requestedVoice = book.speechVoice ?? routing.voice;
        const requestedSpeed = Number(routing.speed) || 1;
      const controller = new AbortController();
      cancelled.current = false;
      runController.current = controller;
      setProcessingStage(active);
      try {
        const sourceReadingOrder = new Map(
          buildTextCatalog(book).map((entry, entryIndex) => [entry.id, entryIndex]),
        );
        const speakableCatalogItems = catalogs.flatMap((catalog) =>
          [...catalog.entries]
            .sort(
              (a, b) =>
                a.pageNumber - b.pageNumber ||
                (sourceReadingOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                  (sourceReadingOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
            )
            .filter((entry) =>
              isSpeakableText(prepareTextForSpeech(entry.text)),
            )
            .map((entry) => ({ catalog, entry })),
        );
        const total = speakableCatalogItems.length;
        const catalogEntryIds = new Set(
          speakableCatalogItems.map(
            ({ catalog, entry }) => `${catalog.language}:${entry.id}`,
          ),
        );
        const catalogSpeechInputs = new Map(
          speakableCatalogItems.map(({ catalog, entry }) => [
            `${catalog.language}:${entry.id}`,
            prepareTextForSpeech(entry.text, catalog.language),
          ]),
        );
        const persistedSpeechCandidates = (book.speechEntries ?? []).filter(
          (entry) =>
            catalogEntryIds.has(entry.id) &&
            entry.inputText === catalogSpeechInputs.get(entry.id) &&
            entry.voice === requestedVoice &&
            entry.speed === requestedSpeed,
        );
        // Verify restored audio before carrying it into the next IndexedDB
        // checkpoint. Chromium can restore a Blob whose temporary native
        // backing file has expired; attempting to save that handle again aborts
        // the whole book write with InvalidBlob. Valid clips are materialized
        // into owned bytes and only broken clips are regenerated.
        const persistedSpeech = (
          await Promise.all(
            persistedSpeechCandidates.map(async (entry) => {
              try {
                if (!(entry.audio instanceof Blob) || entry.audio.size === 0)
                  return undefined;
                const bytes = entry.audioBytes ?? await entry.audio.arrayBuffer();
                return {
                  ...entry,
                  audio: new Blob([bytes], {
                    type: entry.audio.type || "audio/mpeg",
                  }),
                  audioBytes: bytes,
                };
              } catch {
                return undefined;
              }
            }),
          )
        ).filter(Boolean) as SpeechEntry[];
        const speechKeyFor = (language: string, text: string) =>
          `${language}\u0000${requestedVoice}\u0000${requestedSpeed}\u0000${text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase()}`;
        const reusableSpeech = new Map(
          persistedSpeech.map((speech) => [
            speechKeyFor(speech.language, speech.inputText ?? ""),
            speech,
          ]),
        );
        const reusedSpeech = speakableCatalogItems.flatMap(({ catalog, entry }) => {
          const id = `${catalog.language}:${entry.id}`;
          if (persistedSpeech.some((speech) => speech.id === id)) return [];
          const inputText = prepareTextForSpeech(entry.text, catalog.language);
          const template = reusableSpeech.get(speechKeyFor(catalog.language, inputText));
          return template
            ? [{ ...template, id, textId: entry.id, pageNumber: entry.pageNumber, inputText }]
            : [];
        });
        const initialSpeechEntries = [...persistedSpeech, ...reusedSpeech];
        let working: DeviceBook = {
          ...book,
          speechEntries: initialSpeechEntries,
          stageProgress: {
            ...book.stageProgress,
            speech: Math.round((initialSpeechEntries.length / total) * 100),
          },
          pipelineRun: {
            stage: "speech",
            status: "running",
            startedAt: new Date().toISOString(),
          },
        };
        await onChange(working, "Started speech generation");
        const pending = speakableCatalogItems.filter(
          ({ catalog, entry }) =>
            !initialSpeechEntries.some(
              (speech) =>
                speech.id === `${catalog.language}:${entry.id}`,
            ),
        );
        const pendingGroups = [...pending.reduce((groups, item) => {
          const inputText = prepareTextForSpeech(item.entry.text, item.catalog.language);
          const key = speechKeyFor(item.catalog.language, inputText);
          const group = groups.get(key) ?? [];
          group.push(item);
          groups.set(key, group);
          return groups;
        }, new Map<string, typeof pending>()).values()];
        const speechConcurrency =
          book.performanceMode === "eco"
            ? 3
            : book.performanceMode === "maximum"
              ? provider === "gemini" ? 8 : 8
              : provider === "gemini" ? 5 : 5;
        const speechCheckpointSize = speechConcurrency * 4;
        for (let index = 0; index < pendingGroups.length; index += speechCheckpointSize) {
          const batch = pendingGroups.slice(index, index + speechCheckpointSize);
          const generated = await mapWithConcurrency(
            batch,
            speechConcurrency,
            async (group) => {
              controller.signal.throwIfAborted();
              const { catalog, entry } = group[0]!;
              const template = await synthesizeCatalogEntry({
                entry,
                language: catalog.language,
                provider,
                keys: providerKeys,
                voice: requestedVoice,
                speed: requestedSpeed,
                signal: controller.signal,
              });
              return group.map(({ catalog: targetCatalog, entry: targetEntry }) => ({
                ...template,
                id: `${targetCatalog.language}:${targetEntry.id}`,
                textId: targetEntry.id,
                language: targetCatalog.language,
                pageNumber: targetEntry.pageNumber,
                inputText: prepareTextForSpeech(targetEntry.text, targetCatalog.language),
              }));
            },
            controller.signal,
          );
            controller.signal.throwIfAborted();
            const speechEntries = [
              ...(working.speechEntries ?? []),
              ...generated.flat(),
            ];
            working = {
              ...working,
              speechEntries,
              stageProgress: {
                ...working.stageProgress,
                speech: Math.round((speechEntries.length / total) * 100),
              },
            };
            await onChange(
              working,
              `Generated ${generated.length} unique speech clips and reused them for ${generated.flat().length} catalog targets`,
            );
        }
        working = {
          ...working,
          pipelineSteps: completePipelineSteps(
            working.pipelineSteps,
            ["tts", "word-timestamps"],
            "complete",
          ),
          pipelineRun: { ...working.pipelineRun!, status: "complete" },
          stageProgress: { ...working.stageProgress, speech: 100 },
        };
        await onChange(working, "Completed narration and word highlighting");
        toast.complete("Narration and word highlighting are ready for review.");
      } catch (error) {
        console.error("[speech-stage]", error);
        if (!isAbortError(error) || !controller.signal.aborted) {
          const failed = {
            ...book,
            pipelineRun: book.pipelineRun
              ? { ...book.pipelineRun, status: "stopped" as const }
              : undefined,
          };
          await onChange(failed, "Speech generation stopped with an error").catch(
            () => undefined,
          );
          toast.error(
            error instanceof Error
              ? error.message
              : "Speech generation failed.",
          );
        }
      } finally {
        if (runController.current === controller)
          runController.current = undefined;
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "sign-language") {
      const unmapped =
        book.signVideos?.filter((video) => !video.target?.trim()) ?? [];
      if (!book.signVideos?.length) {
        toast.error(
          "Add at least one signed video before completing this stage.",
        );
        return;
      }
      if (unmapped.length) {
        toast.error(
          `Map all signed videos first. ${unmapped.length} remain unassigned.`,
        );
        return;
      }
      await onChange(
        {
          ...book,
          pipelineSteps: completePipelineSteps(
            book.pipelineSteps,
            ["sign-language-mapping"],
            "complete",
          ),
          stageProgress: { ...book.stageProgress, "sign-language": 100 },
          pipelineRun: {
            stage: "sign-language",
            status: "complete",
            startedAt: new Date().toISOString(),
          },
        },
        "Completed signed-media mapping",
      );
      toast.complete("Every signed video has a content target.");
      return;
    }
    if (active === "validate") {
      setProcessingStage(active);
      try {
        const validationReport = validateBook(book);
        await onChange(
          {
            ...book,
            validationReport,
            pipelineSteps: completePipelineSteps(
              book.pipelineSteps,
              ["package-web", "accessibility-assessment"],
              validationReport.passed ? "complete" : "stopped",
            ),
            stageProgress: {
              ...book.stageProgress,
              validate: validationReport.passed ? 100 : 75,
            },
            pipelineRun: {
              stage: "validate",
              status: validationReport.passed ? "complete" : "stopped",
              startedAt: new Date().toISOString(),
            },
          },
          "Completed accessibility assessment",
        );
        if (validationReport.passed)
          toast.complete("The publication passed validation.");
        else toast.warning("Validation found issues that need attention.");
      } finally {
        setProcessingStage(undefined);
      }
      return;
    }
    if (active === "export") {
      if (!book.validationReport?.passed) {
        toast.error("Run Validate and resolve all errors before exporting.");
        return;
      }
      setProcessingStage(active);
      try {
        const exportArtifact = await packageBook(book);
        await onChange(
          {
            ...book,
            exportArtifact,
            pipelineSteps: completePipelineSteps(
              book.pipelineSteps,
              ["package-web"],
              "complete",
            ),
            stageProgress: { ...book.stageProgress, export: 100 },
            pipelineRun: {
              stage: "export",
              status: "complete",
              startedAt: new Date().toISOString(),
            },
          },
          "Packaged offline web publication",
        );
        toast.complete("The offline web publication is ready to download.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Export failed.");
      } finally {
        setProcessingStage(undefined);
      }
      return;
    }
    if (active !== "extract") {
      await onChange(
        {
          ...book,
          pipelineRun: {
            stage: active,
            status: "running",
            startedAt: new Date().toISOString(),
          },
        },
        `Started ${stage.label}`,
      );
      return toast.success(`${stage.label} started.`);
    }
    cancelled.current = false;
    runController.current = new AbortController();
    setProcessingStage(active);
    try {
      const { default: mupdf } = await import("mupdf");
      const sourceBytes = await durableSourceBytes(book);
      const document = mupdf.Document.openDocument(
        sourceBytes,
        "application/pdf",
      );
      const sourceTotalPages = document.countPages();
      const selectedPages = selectedSourcePages(
        sourceTotalPages,
        book.conversionConfig,
      );
      if (!selectedPages.length)
        throw new Error(
          "The selected conversion scope contains no valid source pages.",
        );
      const repeatAll = book.conversionConfig?.rangeRunMode === "all";
      const selectedSet = new Set(selectedPages);
      let existingPages = repeatAll
        ? []
        : (book.extractedPages ?? []).filter((page) =>
            selectedSet.has(page.number),
          );
      const existingNumbers = new Set(existingPages.map((page) => page.number));
      let pagesToExtract = repeatAll
        ? selectedPages
        : selectedPages.filter((page) => !existingNumbers.has(page));
      if (!pagesToExtract.length) {
        existingPages = [];
        pagesToExtract = selectedPages;
        toast.info("Re-extracting every selected source page.");
      }
      const totalPages = selectedPages.length;
      let working: DeviceBook = {
        ...book,
        totalPages,
        sourceTotalPages,
        extractedPages: existingPages,
        stageProgress: {
          ...book.stageProgress,
          extract: Math.round((existingPages.length / totalPages) * 100),
        },
        pipelineRun: {
          stage: "extract",
          status: "running",
          startedAt: new Date().toISOString(),
        },
        performanceMode: book.performanceMode ?? "balanced",
      };
      await onChange(working, "Started PDF extraction");
      for (
        let selectionIndex = 0;
        selectionIndex < pagesToExtract.length && !cancelled.current;
        selectionIndex += 1
      ) {
        const physicalPageNumber = pagesToExtract[selectionIndex]!;
        const index = physicalPageNumber - 1;
        const page = document.loadPage(index);
        const textLayer = page.toStructuredText(
          "preserve-images,preserve-spans",
        );
        const text = normalizeExtractedText(textLayer.asText());
        const bounds = page.getBounds();
        const layoutBlocks: ExtractedLayoutBlock[] = [];
        let line: ExtractedLayoutBlock | undefined;
        let lineFonts = new Map<
          string,
          { count: number; value: NonNullable<ExtractedLayoutBlock["font"]> }
        >();
        textLayer.walk({
          beginLine(rect) {
            lineFonts = new Map();
            line = {
              type: "text",
              bbox: {
                x: rect[0],
                y: rect[1],
                w: rect[2] - rect[0],
                h: rect[3] - rect[1],
              },
              text: "",
            };
          },
          onChar(character, _origin, font, size, _quad, color) {
            if (!line) return;
            line.text += character;
            const value = {
              name: font.getName(),
              family: font.getName(),
              weight: font.isBold() ? "bold" : "normal",
              style: font.isItalic() ? "italic" : "normal",
              size,
              color: mupdfColor(color),
            };
            const key = `${value.family}|${value.weight}|${value.style}|${Math.round(size * 10)}|${value.color}`;
            const current = lineFonts.get(key);
            lineFonts.set(key, {
              count: (current?.count ?? 0) + Math.max(1, character.length),
              value,
            });
          },
          endLine() {
            if (line?.text?.trim()) {
              line.font = [...lineFonts.values()].sort(
                (a, b) => b.count - a.count,
              )[0]?.value;
              layoutBlocks.push({
                ...line,
                text: normalizeExtractedText(line.text).replace(/\s+/g, " ").trim(),
              });
            }
            line = undefined;
          },
          onImageBlock(rect) {
            layoutBlocks.push({
              type: "image",
              bbox: {
                x: rect[0],
                y: rect[1],
                w: rect[2] - rect[0],
                h: rect[3] - rect[1],
              },
            });
          },
        });
        layoutBlocks.push(...extractVectorRuleBlocks(page, mupdf));
        const renderScale =
          working.performanceMode === "maximum"
            ? 1
            : working.performanceMode === "eco"
              ? 0.5
              : 0.75;
        const pixmap = page.toPixmap(
          mupdf.Matrix.scale(renderScale, renderScale),
          mupdf.ColorSpace.DeviceRGB,
          false,
        );
        const png = pixmap.asPNG();
        const thumbnailBytes = Uint8Array.from(png).buffer as ArrayBuffer;
        const thumbnail = new Blob([thumbnailBytes], { type: "image/png" });
        const assets: ExtractedPageAsset[] = [];
        const seenImages = new Set<string>();
        const imageDevice = new mupdf.Device({
          fillImage(image, transform) {
            const rect = mupdf.Rect.transform([0, 0, 1, 1], transform);
            const imageWidth = image.getWidth();
            const imageHeight = image.getHeight();
            const assetBounds = {
              x: rect[0],
              y: rect[1],
              w: rect[2] - rect[0],
              h: rect[3] - rect[1],
            };
            const coverage =
              Math.abs(assetBounds.w * assetBounds.h) /
              Math.max(1, (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]));
            const aspect = Math.abs(assetBounds.w / Math.max(1, assetBounds.h));
            const insidePage =
              assetBounds.x >= bounds[0] - 2 &&
              assetBounds.y >= bounds[1] - 2 &&
              assetBounds.x + assetBounds.w <= bounds[2] + 2 &&
              assetBounds.y + assetBounds.h <= bounds[3] + 2;
            const key = [
              Math.round(assetBounds.x),
              Math.round(assetBounds.y),
              Math.round(assetBounds.w),
              Math.round(assetBounds.h),
              imageWidth,
              imageHeight,
            ].join(":");
            if (
              imageWidth < 6 ||
              imageHeight < 6 ||
              coverage < 0.00008 ||
              coverage > 0.72 ||
              aspect < 0.03 ||
              aspect > 30 ||
              !insidePage ||
              seenImages.has(key)
            )
              return;
            seenImages.add(key);
            try {
              const imagePixmap = image.toPixmap();
              try {
                const imagePng = imagePixmap.asPNG();
                const bytes = Uint8Array.from(imagePng).buffer as ArrayBuffer;
                assets.push({
                  id: `page-${index + 1}-image-${assets.length}`,
                  kind: "image",
                  blob: new Blob([bytes], { type: "image/png" }),
                  bytes,
                  bounds: assetBounds,
                });
              } finally {
                imagePixmap.destroy();
              }
            } catch {
              // Masks and unusual colour spaces are recovered from the
              // composed high-resolution page during Storyboard.
            }
          },
        });
        page.run(imageDevice, mupdf.Matrix.identity);
        imageDevice.close();
        imageDevice.destroy();
        const extracted = {
          number: physicalPageNumber,
          status: "ready" as const,
          extractedAt: new Date().toISOString(),
          text,
          thumbnail,
          thumbnailBytes,
          width: bounds[2] - bounds[0],
          height: bounds[3] - bounds[1],
          layoutBlocks,
          assets,
        };
        textLayer.destroy();
        pixmap.destroy();
        page.destroy();
        const pages = [
          ...(working.extractedPages ?? []).filter(
            (candidate) => candidate.number !== extracted.number,
          ),
          extracted,
        ].sort((a, b) => a.number - b.number);
        const progress = Math.round((pages.length / totalPages) * 100);
        working = {
          ...working,
          extractedPages: pages,
          stageProgress: { ...working.stageProgress, extract: progress },
        };
        await onChange(working, `Extracted page ${index + 1}`);
        await new Promise((resolve) =>
          window.setTimeout(resolve, performanceDelay(working.performanceMode)),
        );
      }
      document.destroy();
      const extractedText = (working.extractedPages ?? [])
        .map((page) => page.text ?? "")
        .join("\n");
      working = {
        ...working,
        metadata: {
          title: working.name.replace(/\.[^.]+$/, ""),
          pageCount: totalPages,
          languageCode: detectSourceLanguage(
            extractedText,
            working.conversionConfig?.editingLanguage,
          ),
        },
        summary: summarizeBook(extractedText),
        pipelineSteps: completePipelineSteps(
          working.pipelineSteps,
          [
            "extract",
            "metadata",
            "book-summary",
            "image-filtering",
            "image-segmentation",
            "image-meaningfulness",
            "image-cropping",
          ],
          cancelled.current ? "stopped" : "complete",
        ),
        pipelineRun: {
          ...working.pipelineRun!,
          status: cancelled.current ? "stopped" : "complete",
        },
      };
      await onChange(
        working,
        cancelled.current ? "Stopped extraction" : "Completed extraction",
      );
      if (!cancelled.current)
        toast.complete("All PDF pages were extracted and saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "PDF extraction failed.",
      );
    } finally {
      setProcessingStage(undefined);
    }
  }
  async function stop() {
    cancelled.current = true;
    runController.current?.abort(
      new DOMException("Stage stopped by the user.", "AbortError"),
    );
    runController.current = undefined;
    setProcessingStage(undefined);
    await onChange(
      {
        ...book,
        pipelineRun: {
          stage: active,
          status: "stopped",
          startedAt: book.pipelineRun?.startedAt ?? new Date().toISOString(),
        },
      },
      `Stopped ${stage.label}`,
    );
    toast.warning(`${stage.label} stopped safely.`);
  }
  async function rerenderSinglePage(pageNumber: number, instructions?: string) {
    const requestedFixes = instructions?.trim();
    if (requestedFixes && !providerKeys) {
      onConfigureProvider();
      throw new Error(
        "Configure an AI provider before re-rendering with instructions.",
      );
    }
    const current = book.storyboardPages?.find(
      (page) => page.pageNumber === pageNumber,
    );
    if (!current)
      throw new Error(`Page ${pageNumber} has not been storyboarded yet.`);
    const revision = {
      id: crypto.randomUUID(),
      pageNumber,
      createdAt: new Date().toISOString(),
      summary: instructions?.trim()
        ? `Before page-specific re-render: ${instructions.trim().slice(0, 90)}`
        : "Before page-specific re-render",
      page: current,
    };
    const prepared = {
      ...book,
      storyboardPageRevisions: [
        ...(book.storyboardPageRevisions ?? []),
        revision,
      ],
    };
    const controller = new AbortController();
    onRerenderStateChange([pageNumber]);
    try {
      // Let React paint the page-scoped progress state before PDF/image work
      // starts on the main thread.
      await yieldToBrowser();
      let rendered: DeviceBook;
      try {
        rendered = await withStoryboardPageTimeout(
          rerenderPageFromAssistant(
            prepared,
            pageNumber,
            requestedFixes,
            `manual-page-${pageNumber}-${revision.id}`,
            providerKeys,
            controller.signal,
          ),
          30_000,
          controller.signal,
        );
      } catch (error) {
        if (isAbortError(error)) throw error;
        controller.abort(new DOMException("Instructed rerender timed out", "AbortError"));
        await yieldToBrowser();
        rendered = await withStoryboardPageTimeout(
          rerenderPageFromAssistant(
            prepared,
            pageNumber,
            undefined,
            `manual-page-fallback-${pageNumber}-${revision.id}`,
          ),
          20_000,
        );
        toast.warning(
          `Page ${pageNumber} took too long with instructions, so Litera completed a faithful local rebuild instead.`,
        );
      }
      await onChange(rendered, `Re-rendered storyboard page ${pageNumber}`);
    } finally {
      onRerenderStateChange([]);
    }
  }
  async function regenerateSingleSpeech(
    speech: SpeechEntry,
    instructions?: string,
  ) {
    if (!providerKeys) {
      onConfigureProvider();
      throw new Error("Configure a speech-capable provider first.");
    }
    const catalog = book.languageCatalogs?.[speech.language];
    const entry = catalog?.entries.find((candidate) => candidate.id === speech.textId);
    if (!entry) throw new Error("The source text for this speech item is unavailable.");
    const routing = loadProviderRouting();
    const regenerated = await synthesizeCatalogEntry({
      entry,
      language: speech.language,
      provider: selectSpeechProvider(providerKeys),
      keys: providerKeys,
      voice: speech.voice ?? book.speechVoice ?? routing.voice,
      speed: speech.speed ?? (Number(routing.speed) || 1),
      instructions,
    });
    await onChange(
      {
        ...book,
        speechEntries: (book.speechEntries ?? []).map((candidate) =>
          candidate.id === speech.id ? regenerated : candidate,
        ),
      },
      `Regenerated speech ${speech.textId}`,
    );
    toast.complete("The selected speech clip was regenerated.");
  }
  async function resolveValidationWithAi(onProgress?: (completed: number, total: number, pageNumber?: number) => void) {
    if (!providerKeys) {
      onConfigureProvider();
      return;
    }
    const report = book.validationReport ?? validateBook(book);
    const affectedPages = [...new Set(report.issues.flatMap((issue) =>
      issue.pageNumber ? [issue.pageNumber] : [],
    ))];
    let working = book;
    try {
      onProgress?.(0, Math.max(1, affectedPages.length));
      for (const [pageIndex, pageNumber] of affectedPages.entries()) {
        onProgress?.(pageIndex, affectedPages.length, pageNumber);
        const pageIssues = report.issues
          .filter((issue) => issue.pageNumber === pageNumber)
          .map((issue) => `- ${issue.message}`)
          .join("\n");
        working = await rerenderPageFromAssistant(
          working,
          pageNumber,
          `Resolve these validation findings without changing the source-book layout, wording, images, activities, answer placement, or visual identity:\n${pageIssues}\nReturn safe semantic HTML with a main landmark, unique stable IDs, descriptive alternative text, and only Litera's recognised answer-feedback runtime.`,
          `validation-ai-${pageNumber}-${crypto.randomUUID()}`,
          providerKeys,
        );
        working = {
          ...working,
          storyboardPages: working.storyboardPages?.map((page) =>
            page.pageNumber === pageNumber
              ? { ...page, html: enforceValidationPolicy(page.html) }
              : page,
          ),
        };
        await onChange(working, `AI resolved validation findings on page ${pageNumber}`);
        onProgress?.(pageIndex + 1, affectedPages.length, pageNumber);
      }
      const validationReport = validateBook(working);
      await onChange(
        {
          ...working,
          validationReport,
          stageProgress: {
            ...working.stageProgress,
            validate: validationReport.passed ? 100 : 75,
          },
          pipelineRun: {
            stage: "validate",
            status: validationReport.passed ? "complete" : "stopped",
            startedAt: new Date().toISOString(),
          },
        },
        "AI repair completed and validation reran",
      );
      if (validationReport.passed) toast.complete("AI repairs passed validation.");
      else toast.warning("AI repaired the page findings; remaining pipeline issues are listed below.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI validation repair failed.");
    }
  }
  const main = (
    <div className="min-w-0">
      <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline">
            Stage {stages.findIndex((item) => item.slug === active) + 1} of{" "}
            {stages.length}
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {stage.label}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {stage.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active !== "publish" && active !== "preview" ? <>
          <Select
            onValueChange={(value) =>
              void onChange(
                {
                  ...book,
                  performanceMode: value as DeviceBook["performanceMode"],
                },
                "Changed performance profile",
              )
            }
            value={book.performanceMode ?? "balanced"}
          >
            <SelectTrigger className="w-44">
              <Gauge />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Performance</SelectLabel>
                <SelectItem value="eco">Eco · low memory</SelectItem>
                <SelectItem value="balanced">Balanced · recommended</SelectItem>
                <SelectItem value="maximum">Maximum · 16 GB+ RAM</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {running ? (
            <Button onClick={() => void stop()} variant="destructive">
              <CircleStop data-icon="inline-start" />
              Stop stage
            </Button>
          ) : (
            <Button
              disabled={prerequisiteBlocked || anotherStageRunning}
              onClick={() => void run()}
              title={
                prerequisiteBlocked
                  ? `Complete ${stages.find((item) => item.slug === prerequisite)?.label} before running ${stage.label}`
                  : anotherStageRunning
                    ? "Wait for the running stage to finish or stop it from that stage"
                  : undefined
              }
            >
              <Play data-icon="inline-start" />
              {prerequisiteBlocked
                ? `Complete ${stages.find((item) => item.slug === prerequisite)?.label} first`
                : anotherStageRunning
                  ? "Another stage is running"
                : progress
                  ? "Run again"
                  : "Run stage"}
            </Button>
          )}
          </> : null}
        </div>
      </div>
      {active === "image-captioning" || active === "easy-read" ? (
        <ReadingLevelSelector book={book} onChange={onChange} />
      ) : null}
      {active !== "preview" ? <Card className="mt-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>
                {running
                  ? "Processing"
                  : progress === 100
                    ? "Stage complete"
                    : "Ready"}
              </CardTitle>
              <CardDescription className="mt-1">
                {running
                  ? `${progress}% complete · progress is based on persisted page outputs.`
                  : "Run this stage independently. Existing outputs remain versioned."}
              </CardDescription>
            </div>
            <strong className="text-2xl tabular-nums">{progress}%</strong>
          </div>
        </CardHeader>
        <CardContent>
          <Progress
            className={cn("h-2", running && "pipeline-progress")}
            value={progress}
          />
          <StageTaskStatus
            active={active}
            progress={progress}
            running={running}
            stopped={
              book.pipelineRun?.stage === active &&
              book.pipelineRun.status === "stopped"
            }
          />
        </CardContent>
      </Card> : null}
      {active === "extract" ? (
        <ExtractionWorkspace book={book} onChange={onChange} />
      ) : active === "structure" ? (
        <StructureWorkspace book={book} onChange={onChange} />
      ) : active === "storyboard" ? (
        <StoryboardWorkspace
          book={book}
          onChange={onChange}
          onPageRenderStateChange={onStoryboardPageReadyChange}
          onRerenderPage={rerenderSinglePage}
          providerKeys={providerKeys}
          rerenderingPages={rerenderingPages}
        />
      ) : active === "preview" ? (
        <PreviewWorkspace book={book} />
      ) : active === "language" ? (
        <LanguageWorkspace book={book} onChange={onChange} />
      ) : active === "speech" ? (
        <SpeechWorkspace
          book={book}
          onChange={onChange}
          onRegenerateSpeech={regenerateSingleSpeech}
        />
      ) : active === "sign-language" ? (
        <SignLanguageWorkspace book={book} onChange={onChange} />
      ) : active === "validate" ? (
        <ValidationWorkspace
          book={book}
          onResolve={resolveValidationWithAi}
          onSelectStage={(stage) => onSelectStage(stage)}
        />
      ) : active === "export" ? (
        <ExportWorkspace book={book} />
      ) : active === "publish" ? (
        <PublishWorkspace book={book} onChange={onChange} />
      ) : (
        <StageOutput book={book} stage={active} />
      )}
    </div>
  );
  return <div className={cn("mx-auto max-w-6xl page-transition")}>{main}</div>;
}

function enforceValidationPolicy(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("iframe,object,embed").forEach((element) => element.remove());
  document.querySelectorAll<HTMLScriptElement>("script").forEach((runtime) => {
    if (runtime.src || !runtime.textContent?.includes("dataset.correctAnswer"))
      runtime.remove();
  });
  document.querySelectorAll("img:not([alt])").forEach((image) => image.setAttribute("alt", ""));
  const seen = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-id]").forEach((element) => {
    const id = element.dataset.id;
    if (!id) return;
    if (seen.has(id)) element.removeAttribute("data-id");
    else seen.add(id);
  });
  if (!document.querySelector("main,[role='main']")) {
    const main = document.createElement("main");
    main.setAttribute("data-litera-page", "");
    while (document.body.firstChild) main.append(document.body.firstChild);
    document.body.append(main);
  }
  return `<!doctype html>${document.documentElement.outerHTML}`;
}

async function compileStoryboardTailwindCss(
  pages: NonNullable<DeviceBook["storyboardPages"]>,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/device/storyboard-css", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: pages.map((page) => page.html).join("\n") }),
    signal,
  });
  const payload = (await response.json()) as { css?: string; error?: string };
  if (!response.ok || !payload.css)
    throw new Error(
      payload.error ||
        "Litera could not compile the storyboard Tailwind styles.",
    );
  return payload.css;
}

async function storyboardPhase<T>(label: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (isAbortError(error)) throw error;
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    throw new Error(`${label} failed — ${detail}`);
  }
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

async function withStoryboardPageTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`Page rendering exceeded ${timeoutMs / 1000} seconds.`)),
      timeoutMs,
    );
    signal?.addEventListener(
      "abort",
      () => reject(signal.reason ?? new DOMException("Stopped", "AbortError")),
      { once: true },
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function durableSourceBytes(book: DeviceBook) {
  if (book.sourceBytes?.byteLength) return book.sourceBytes;
  try {
    const bytes = await book.file.arrayBuffer();
    if (bytes.byteLength) return bytes;
  } catch {
    // Older desktop imports may contain an IndexedDB Blob whose native backing object is gone.
  }
  throw new Error(
    "This older import lost its stored source file. Remove it and import the original book again; new imports are stored as durable bytes.",
  );
}

function providerLabel(provider: ProviderId) {
  return provider === "openai"
    ? "OpenAI"
    : provider === "gemini"
      ? "Gemini"
      : provider === "anthropic"
        ? "Anthropic"
        : provider;
}

async function readablePageImage(
  book: DeviceBook,
  page: NonNullable<DeviceBook["extractedPages"]>[number],
) {
  if (page.thumbnailBytes)
    return new Blob([page.thumbnailBytes], { type: "image/png" });
  if (page.thumbnail) {
    try {
      return new Blob([await page.thumbnail.arrayBuffer()], {
        type: page.thumbnail.type || "image/png",
      });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError")
        throw error;
    }
  }
  try {
    const source = await durableSourceBytes(book);
    const { default: mupdf } = await import("mupdf");
    const document = mupdf.Document.openDocument(source, "application/pdf");
    try {
      const pdfPage = document.loadPage(page.number - 1);
      try {
        const scale =
          book.performanceMode === "maximum"
            ? 1
            : book.performanceMode === "eco"
              ? 0.5
              : 0.75;
        const pixmap = pdfPage.toPixmap(
          mupdf.Matrix.scale(scale, scale),
          mupdf.ColorSpace.DeviceRGB,
          false,
        );
        try {
          return new Blob(
            [Uint8Array.from(pixmap.asPNG()).buffer as ArrayBuffer],
            { type: "image/png" },
          );
        } finally {
          pixmap.destroy();
        }
      } finally {
        pdfPage.destroy();
      }
    } finally {
      document.destroy();
    }
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError")
      throw error;
    return layoutPageImage(page);
  }
}

async function layoutPageImage(
  page: NonNullable<DeviceBook["extractedPages"]>[number],
) {
  const sourceWidth = Math.max(1, page.width ?? 612);
  const sourceHeight = Math.max(1, page.height ?? 792);
  const targetWidth = 900;
  const scale = targetWidth / sourceWidth;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("The page layout preview could not be created.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "top";
  let visibleTextBlocks = 0;
  for (const block of page.layoutBlocks ?? []) {
    const x = block.bbox.x * scale;
    const y = block.bbox.y * scale;
    const width = Math.max(8, block.bbox.w * scale);
    const height = Math.max(8, block.bbox.h * scale);
    if (block.type === "image") {
      context.fillStyle = "#f3f4f6";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#d1d5db";
      context.strokeRect(x, y, width, height);
      continue;
    }
    const fontSize = Math.max(
      10,
      Math.min(72, (block.font?.size ?? 11) * scale),
    );
    const weight = /bold|700|800|900/i.test(block.font?.weight ?? "")
      ? "700"
      : "400";
    context.font = `${weight} ${fontSize}px ${block.font?.family || "Arial"}`;
    context.fillStyle = "#111827";
    if (
      block.text &&
      x < canvas.width &&
      y < canvas.height &&
      x + width > 0 &&
      y + height > 0
    )
      visibleTextBlocks += 1;
    drawWrappedText(
      context,
      block.text ?? "",
      x,
      y,
      width,
      Math.max(fontSize * 1.15, 12),
      height,
    );
  }
  if (!visibleTextBlocks && page.text?.trim()) {
    context.fillStyle = "#111827";
    context.font = "400 24px Arial";
    drawWrappedText(
      context,
      page.text,
      54,
      54,
      canvas.width - 108,
      34,
      canvas.height - 108,
    );
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error("The reconstructed page image could not be encoded."),
            ),
      "image/png",
      0.9,
    ),
  );
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxHeight: number,
) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  let line = "";
  let offset = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, y + offset, maxWidth);
      line = word;
      offset += lineHeight;
      if (offset + lineHeight > maxHeight) return;
    } else line = candidate;
  }
  if (line && offset <= maxHeight)
    context.fillText(line, x, y + offset, maxWidth);
}

async function ensurePageAssets(
  book: DeviceBook,
  page: NonNullable<DeviceBook["extractedPages"]>[number] & { thumbnail: Blob },
) {
  const textBlocks = (page.layoutBlocks ?? []).filter(
    (block) => block.type === "text" && block.text?.trim(),
  );
  // Some PDFs expose a raster backdrop that already contains their printed
  // text in addition to a selectable text layer. Keeping both produces a
  // ghosted duplicate in HTML, so only retain independent visual regions.
  const sourceWidth = Math.max(1, page.width ?? 612);
  const sourceHeight = Math.max(1, page.height ?? 792);
  // Always refine visual assets against a fresh source-PDF render. Persisted
  // thumbnails may already contain pixels changed by an older crop-cleanup
  // pass, so using them prevents a later engine fix from repairing the book.
  const composedSource =
    (book.sourceFormat === "pdf"
      ? await renderHighResolutionPageImage(book, page.number)
      : undefined) ?? page.thumbnail;
  const compositeAssets = await recoverComposedExampleAssets(
    { ...page, thumbnail: composedSource },
    sourceWidth,
    sourceHeight,
  );
  // Extraction already persists native artwork for ordinary conversions.
  // Re-walking the entire PDF object tree here made Storyboard needlessly
  // expensive (and could duplicate assets) on image-heavy textbooks. Recover
  // from the source only for legacy/incomplete pages that have no saved assets.
  const recoveredNativeAssets = await recoverNativePageAssets(
    book,
    page.number,
    sourceWidth,
    sourceHeight,
  );
  let assets = deduplicateAssets([
    ...(page.assets ?? []),
    ...recoveredNativeAssets,
    ...compositeAssets,
  ])
    .filter((asset) => {
      if (isPrinterControlRegion(asset.bounds, sourceWidth, sourceHeight))
        return false;
      if (isHairlineVisual(asset.bounds, sourceWidth, sourceHeight))
        return false;
      const centerY = asset.bounds.y + asset.bounds.h / 2;
      const coverage =
        Math.abs(asset.bounds.w * asset.bounds.h) /
        (sourceWidth * sourceHeight);
      if (centerY >= sourceHeight * 0.9 && coverage <= 0.04) return false;
      // Native PDF artwork can legitimately sit under independent labels.
      // Reject only composed/text-bearing regions and near-page backdrops;
      // overlap alone must not make an illustration disappear.
      if (
        (asset.containsText &&
          !asset.id.includes("composite-example") &&
          !asset.id.includes("composite-activity-diagram")) ||
        coverage > 0.72
      )
        return false;
      return true;
    })
    .map((asset) =>
      asset.bytes
        ? { ...asset, blob: new Blob([asset.bytes], { type: "image/png" }) }
        : asset,
    );
  const fragmentComposites = await recoverFragmentCompositeAssets(
    assets,
    composedSource,
    sourceWidth,
    sourceHeight,
    page.number,
  );
  assets = deduplicateAssets([...fragmentComposites, ...assets]);
  let visualBlocks = (page.layoutBlocks ?? []).filter((block) => {
    if (block.type !== "image") return false;
    if (isPrinterControlRegion(block.bbox, sourceWidth, sourceHeight))
      return false;
    if (isHairlineVisual(block.bbox, sourceWidth, sourceHeight)) return false;
    const coverage =
      Math.abs(block.bbox.w * block.bbox.h) / (sourceWidth * sourceHeight);
    if (
      block.bbox.y + block.bbox.h / 2 >= sourceHeight * 0.9 &&
      coverage <= 0.04
    )
      return false;
    const textCoverage = regionTextCoverage(
      block.bbox,
      textBlocks.map((text) => text.bbox),
    );
    return coverage >= 0.0002 && coverage <= 0.6 && textCoverage <= 0.28;
  });
  // Native PDF assets are not a complete inventory: many textbook figures
  // are painted from vector paths, masks, or several small image fragments.
  // Always inspect the composed source page for unmatched visual regions,
  // even when the page already yielded one or two native images.
  const composedVisualBlocks = (
    await detectVisualRegions(composedSource, sourceWidth, sourceHeight)
  )
    .filter((bbox) => !isPrinterControlRegion(bbox, sourceWidth, sourceHeight))
    .filter((bbox) => !isHairlineVisual(bbox, sourceWidth, sourceHeight))
    .filter(
      (bbox) =>
        regionTextCoverage(bbox, textBlocks.map((block) => block.bbox)) <=
        0.28,
    )
    .filter(
      (bbox) =>
        !assets.some((asset) => overlapRatio(asset.bounds, bbox) > 0.72) &&
        !visualBlocks.some((block) => overlapRatio(block.bbox, bbox) > 0.72),
    )
    .map((bbox) => ({ type: "image" as const, bbox }));
  visualBlocks = [...visualBlocks, ...composedVisualBlocks];
  const missing = visualBlocks.filter(
    (block) =>
      !assets.some((asset) => overlapRatio(asset.bounds, block.bbox) > 0.72),
  );
  if (!missing.length)
    return refinePageAssets(
      assets,
      composedSource,
      sourceWidth,
      sourceHeight,
      textBlocks,
    );
  const bitmap = await createImageBitmap(composedSource);
  try {
    const scaleX = bitmap.width / sourceWidth;
    const scaleY = bitmap.height / sourceHeight;
    for (const [index, block] of missing.entries()) {
      const sx = Math.max(0, Math.round(block.bbox.x * scaleX));
      const sy = Math.max(0, Math.round(block.bbox.y * scaleY));
      const sw = Math.max(
        1,
        Math.min(bitmap.width - sx, Math.round(block.bbox.w * scaleX)),
      );
      const sh = Math.max(
        1,
        Math.min(bitmap.height - sy, Math.round(block.bbox.h * scaleY)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      removeWatermarkPixels(context, sw, sh);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.94),
      );
      if (blob)
        assets.push({
          id: `page-${page.number}-visual-${assets.length + index}`,
          kind: "image",
          blob,
          bytes: await blob.arrayBuffer(),
          bounds: block.bbox,
        });
    }
  } finally {
    bitmap.close();
  }
  return refinePageAssets(
    assets,
    composedSource,
    sourceWidth,
    sourceHeight,
    textBlocks,
  );
}

async function recoverComposedExampleAssets(
  page: NonNullable<DeviceBook["extractedPages"]>[number] & {
    thumbnail: Blob;
  },
  sourceWidth: number,
  sourceHeight: number,
) {
  const blocks = [...(page.layoutBlocks ?? [])].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  );
  const results: ExtractedPageAsset[] = [];
  const bitmap = await createImageBitmap(page.thumbnail);
  try {
    for (let index = 0; index < blocks.length; index += 1) {
      const start = blocks[index];
      if (
        start?.type !== "text" ||
        !/^(?:mfano|example)\s+(?:wa\s+)?\d+/i.test(start.text?.trim() ?? "")
      )
        continue;
      const end = blocks
        .slice(index + 1)
        .find(
          (block) =>
            block.type === "text" &&
            /^(?:zoezi|activity|exercise|practice|maswali|shughuli)\b/i.test(
              block.text?.trim() ?? "",
            ),
        );
      if (!end) continue;
      const regionBlocks = blocks.filter(
        (block) => block.bbox.y >= start.bbox.y && block.bbox.y < end.bbox.y,
      );
      if (regionBlocks.length < 5) continue;
      const left = Math.max(
        0,
        Math.min(...regionBlocks.map((block) => block.bbox.x)) -
          sourceWidth * 0.025,
      );
      const top = Math.max(0, start.bbox.y - sourceHeight * 0.018);
      const right = Math.min(
        sourceWidth,
        Math.max(...regionBlocks.map((block) => block.bbox.x + block.bbox.w)) +
          sourceWidth * 0.025,
      );
      const bottom = Math.min(sourceHeight, end.bbox.y - sourceHeight * 0.012);
      const bounds = { x: left, y: top, w: right - left, h: bottom - top };
      if (
        bounds.w / sourceWidth < 0.45 ||
        bounds.h / sourceHeight < 0.12 ||
        bounds.h / sourceHeight > 0.65
      )
        continue;
      const scaleX = bitmap.width / sourceWidth;
      const scaleY = bitmap.height / sourceHeight;
      const sx = Math.round(bounds.x * scaleX);
      const sy = Math.round(bounds.y * scaleY);
      const sw = Math.max(1, Math.round(bounds.w * scaleX));
      const sh = Math.max(1, Math.round(bounds.h * scaleY));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      context?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      if (context) removeWatermarkPixels(context, sw, sh);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.96),
      );
      if (!blob) continue;
      results.push({
        id: `page-${page.number}-composite-example-${results.length + 1}`,
        kind: "image",
        blob,
        bytes: await blob.arrayBuffer(),
        bounds,
        containsText: true,
      });
    }
    // Some worked examples continue from the previous page and therefore do
    // not repeat a "Mfano" heading. A dense bounded visual region immediately
    // above an activity is still one teaching diagram (for example the
    // place-value card on Hisabati page 65). Preserve that region as one exact
    // source visual rather than losing its vector arrows, grid and labels.
    if (!results.length) {
      const activity = blocks.find(
        (block) =>
          block.type === "text" &&
          /^(?:zoezi|activity|exercise|practice|maswali|shughuli)\b/i.test(
            block.text?.trim() ?? "",
          ),
      );
      const hasExplicitExample = activity
        ? blocks.some(
            (block) =>
              block.type === "text" &&
              block.bbox.y < activity.bbox.y &&
              /^(?:mfano|example)\b/i.test(block.text?.trim() ?? ""),
          )
        : false;
      if (
        activity &&
        !hasExplicitExample &&
        activity.bbox.y > sourceHeight * 0.34 &&
        activity.bbox.y < sourceHeight * 0.82
      ) {
        const regionBlocks = blocks.filter((block) => {
          const coverage =
            (block.bbox.w * block.bbox.h) /
            Math.max(1, sourceWidth * sourceHeight);
          return (
            block.bbox.y >= sourceHeight * 0.055 &&
            block.bbox.y + block.bbox.h <
              activity.bbox.y - sourceHeight * 0.008 &&
            coverage < 0.55 &&
            !isPrinterControlRegion(
              block.bbox,
              sourceWidth,
              sourceHeight,
            )
          );
        });
        const vectorEvidence = regionBlocks.filter(
          (block) => block.type === "image",
        );
        const textEvidence = regionBlocks.filter(
          (block) => block.type === "text" && block.text?.trim(),
        );
        const orderedText = [...textEvidence].sort(
          (a, b) => a.bbox.y - b.bbox.y,
        );
        const largestTextGap = orderedText.slice(1).reduce(
          (largest, block, index) =>
            Math.max(
              largest,
              block.bbox.y -
                (orderedText[index]!.bbox.y + orderedText[index]!.bbox.h),
            ),
          0,
        );
        const missingCentralDiagram =
          textEvidence.length >= 2 && largestTextGap >= sourceHeight * 0.09;
        if (
          (vectorEvidence.length >= 4 && textEvidence.length >= 5) ||
          missingCentralDiagram
        ) {
          const left = Math.max(
            0,
            Math.min(...regionBlocks.map((block) => block.bbox.x)) -
              sourceWidth * 0.018,
          );
          const top = Math.max(
            0,
            Math.min(...regionBlocks.map((block) => block.bbox.y)) -
              sourceHeight * 0.012,
          );
          const right = Math.min(
            sourceWidth,
            Math.max(
              ...regionBlocks.map((block) => block.bbox.x + block.bbox.w),
            ) +
              sourceWidth * 0.018,
          );
          const bottom = Math.min(
            sourceHeight,
            activity.bbox.y - sourceHeight * 0.012,
          );
          const bounds = { x: left, y: top, w: right - left, h: bottom - top };
          if (
            bounds.w / sourceWidth >= 0.5 &&
            bounds.h / sourceHeight >= 0.16 &&
            bounds.h / sourceHeight <= 0.68
          ) {
            const scaleX = bitmap.width / sourceWidth;
            const scaleY = bitmap.height / sourceHeight;
            const sx = Math.max(0, Math.floor(bounds.x * scaleX));
            const sy = Math.max(0, Math.floor(bounds.y * scaleY));
            const sw = Math.max(
              1,
              Math.min(bitmap.width - sx, Math.ceil(bounds.w * scaleX)),
            );
            const sh = Math.max(
              1,
              Math.min(bitmap.height - sy, Math.ceil(bounds.h * scaleY)),
            );
            const canvas = document.createElement("canvas");
            canvas.width = sw;
            canvas.height = sh;
            const context = canvas.getContext("2d");
            context?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
            if (context) removeWatermarkPixels(context, sw, sh);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png", 0.96),
            );
            if (blob)
              results.push({
                id: `page-${page.number}-composite-example-continuation-1`,
                kind: "image",
                blob,
                bytes: await blob.arrayBuffer(),
                bounds,
                containsText: true,
              });
          }
        }
      }
    }
    const shadingPrompt = blocks.find(
      (block) =>
        block.type === "text" &&
        /\b(?:tia\s+kivuli|shade|colour|color)\b/i.test(
          block.text?.trim() ?? "",
        ),
    );
    if (shadingPrompt) {
      const nextQuestion = blocks
        .filter(
          (block) =>
            block.type === "text" &&
            block.bbox.y > shadingPrompt.bbox.y + shadingPrompt.bbox.h &&
            /^\d{1,2}[.)]$/.test(block.text?.trim() ?? ""),
        )
        .sort((a, b) => a.bbox.y - b.bbox.y)[0];
      const top = shadingPrompt.bbox.y + shadingPrompt.bbox.h;
      const bottom = nextQuestion?.bbox.y ?? sourceHeight * 0.88;
      const diagramBlocks = blocks.filter(
        (block) =>
          block.bbox.y >= top &&
          block.bbox.y + block.bbox.h <= bottom &&
          !isPrinterControlRegion(block.bbox, sourceWidth, sourceHeight),
      );
      const vectorCount = diagramBlocks.filter(
        (block) => block.type === "image",
      ).length;
      if (diagramBlocks.length >= 8 && vectorCount >= 5) {
        const left = Math.max(
          0,
          Math.min(...diagramBlocks.map((block) => block.bbox.x)) -
            sourceWidth * 0.012,
        );
        const cropTop = Math.max(
          0,
          Math.min(...diagramBlocks.map((block) => block.bbox.y)) -
            sourceHeight * 0.008,
        );
        const right = Math.min(
          sourceWidth,
          Math.max(
            ...diagramBlocks.map((block) => block.bbox.x + block.bbox.w),
          ) +
            sourceWidth * 0.012,
        );
        const cropBottom = Math.min(
          sourceHeight,
          Math.max(
            ...diagramBlocks.map((block) => block.bbox.y + block.bbox.h),
          ) +
            sourceHeight * 0.008,
        );
        const bounds = {
          x: left,
          y: cropTop,
          w: right - left,
          h: cropBottom - cropTop,
        };
        if (
          bounds.w / sourceWidth >= 0.48 &&
          bounds.h / sourceHeight >= 0.16 &&
          bounds.h / sourceHeight <= 0.72
        ) {
          const scaleX = bitmap.width / sourceWidth;
          const scaleY = bitmap.height / sourceHeight;
          const sx = Math.max(0, Math.floor(bounds.x * scaleX));
          const sy = Math.max(0, Math.floor(bounds.y * scaleY));
          const sw = Math.max(
            1,
            Math.min(bitmap.width - sx, Math.ceil(bounds.w * scaleX)),
          );
          const sh = Math.max(
            1,
            Math.min(bitmap.height - sy, Math.ceil(bounds.h * scaleY)),
          );
          const canvas = document.createElement("canvas");
          canvas.width = sw;
          canvas.height = sh;
          const context = canvas.getContext("2d");
          context?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
          if (context) removeWatermarkPixels(context, sw, sh);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png", 0.96),
          );
          if (blob)
            results.push({
              id: `page-${page.number}-composite-activity-diagram-1`,
              kind: "image",
              blob,
              bytes: await blob.arrayBuffer(),
              bounds,
              containsText: true,
            });
        }
      }
    }
  } finally {
    bitmap.close();
  }
  return results;
}

/** Some print PDFs build one illustration from several touching image tiles.
 * Individually those tiles look too small to be meaningful (the tomatoes on
 * English 3 page 61 are five tiles), so package their exact composed source
 * rectangle as one reusable visual before meaningfulness filtering. */
async function recoverFragmentCompositeAssets(
  assets: ExtractedPageAsset[],
  source: Blob,
  sourceWidth: number,
  sourceHeight: number,
  pageNumber: number,
) {
  const small = assets.filter((asset) => {
    const coverage =
      Math.abs(asset.bounds.w * asset.bounds.h) /
      Math.max(1, sourceWidth * sourceHeight);
    return coverage > 0.0004 && coverage < 0.035;
  });
  const groups: ExtractedPageAsset[][] = [];
  const visited = new Set<ExtractedPageAsset>();
  const gapX = Math.max(2.5, sourceWidth * 0.006);
  const gapY = Math.max(2.5, sourceHeight * 0.006);
  const touches = (a: ExtractedPageAsset, b: ExtractedPageAsset) =>
    a.bounds.x - gapX <= b.bounds.x + b.bounds.w &&
    a.bounds.x + a.bounds.w + gapX >= b.bounds.x &&
    a.bounds.y - gapY <= b.bounds.y + b.bounds.h &&
    a.bounds.y + a.bounds.h + gapY >= b.bounds.y;
  for (const start of small) {
    if (visited.has(start)) continue;
    const group: ExtractedPageAsset[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      for (const candidate of small)
        if (!visited.has(candidate) && touches(current, candidate)) {
          visited.add(candidate);
          queue.push(candidate);
        }
    }
    if (group.length >= 2) groups.push(group);
  }
  if (!groups.length) return [];
  const bitmap = await createImageBitmap(source);
  try {
    const scaleX = bitmap.width / sourceWidth;
    const scaleY = bitmap.height / sourceHeight;
    const composites: ExtractedPageAsset[] = [];
    for (const [index, group] of groups.entries()) {
      const left = Math.min(...group.map((asset) => asset.bounds.x));
      const top = Math.min(...group.map((asset) => asset.bounds.y));
      const right = Math.max(
        ...group.map((asset) => asset.bounds.x + asset.bounds.w),
      );
      const bottom = Math.max(
        ...group.map((asset) => asset.bounds.y + asset.bounds.h),
      );
      const bounds = { x: left, y: top, w: right - left, h: bottom - top };
      const coverage = (bounds.w * bounds.h) / (sourceWidth * sourceHeight);
      if (coverage > 0.09 || bounds.w < 12 || bounds.h < 12) continue;
      const sx = Math.max(0, Math.floor(left * scaleX));
      const sy = Math.max(0, Math.floor(top * scaleY));
      const sw = Math.max(
        1,
        Math.min(bitmap.width - sx, Math.ceil(bounds.w * scaleX)),
      );
      const sh = Math.max(
        1,
        Math.min(bitmap.height - sy, Math.ceil(bounds.h * scaleY)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      if (context) removeWatermarkPixels(context, sw, sh);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.96),
      );
      if (!blob) continue;
      composites.push({
        id: `page-${pageNumber}-fragment-composite-${index}`,
        kind: "image",
        blob,
        bytes: await blob.arrayBuffer(),
        bounds,
      });
    }
    return composites;
  } finally {
    bitmap.close();
  }
}

async function renderHighResolutionPageImage(
  book: DeviceBook,
  pageNumber: number,
) {
  try {
    const { default: mupdf } = await import("mupdf");
    const document = mupdf.Document.openDocument(
      await durableSourceBytes(book),
      "application/pdf",
    );
    const page = document.loadPage(pageNumber - 1);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(2, 2),
      mupdf.ColorSpace.DeviceRGB,
      false,
    );
    try {
      const bytes = Uint8Array.from(pixmap.asPNG()).buffer as ArrayBuffer;
      return new Blob([bytes], { type: "image/png" });
    } finally {
      pixmap.destroy();
      page.destroy();
      document.destroy();
    }
  } catch {
    return undefined;
  }
}

async function recoverNativePageAssets(
  book: DeviceBook,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
) {
  if (book.sourceFormat !== "pdf") return [];
  const recovered: ExtractedPageAsset[] = [];
  try {
    const { default: mupdf } = await import("mupdf");
    const document = mupdf.Document.openDocument(
      await durableSourceBytes(book),
      "application/pdf",
    );
    const page = document.loadPage(pageNumber - 1);
    const seen = new Set<string>();
    const device = new mupdf.Device({
      fillImage(image, transform) {
        const rect = mupdf.Rect.transform([0, 0, 1, 1], transform);
        const bounds = {
          x: rect[0],
          y: rect[1],
          w: rect[2] - rect[0],
          h: rect[3] - rect[1],
        };
        const coverage =
          Math.abs(bounds.w * bounds.h) / Math.max(1, pageWidth * pageHeight);
        const aspect = Math.abs(bounds.w / Math.max(1, bounds.h));
        const key = [
          Math.round(bounds.x),
          Math.round(bounds.y),
          Math.round(bounds.w),
          Math.round(bounds.h),
          image.getWidth(),
          image.getHeight(),
        ].join(":");
        if (
          image.getWidth() < 6 ||
          image.getHeight() < 6 ||
          coverage < 0.00008 ||
          coverage > 0.72 ||
          aspect < 0.03 ||
          aspect > 30 ||
          isHairlineVisual(bounds, pageWidth, pageHeight) ||
          seen.has(key)
        )
          return;
        seen.add(key);
        try {
          const pixmap = image.toPixmap();
          try {
            const bytes = Uint8Array.from(pixmap.asPNG()).buffer as ArrayBuffer;
            recovered.push({
              id: `page-${pageNumber}-native-${recovered.length}`,
              kind: "image",
              blob: new Blob([bytes], { type: "image/png" }),
              bytes,
              bounds,
            });
          } finally {
            pixmap.destroy();
          }
        } catch {
          /* Unsupported masks are recovered from safe layout blocks. */
        }
      },
    });
    page.run(device, mupdf.Matrix.identity);
    device.close();
    device.destroy();
    page.destroy();
    document.destroy();
  } catch {
    return [];
  }
  return recovered;
}

/** Litera-style raster recovery: PDF image masks frequently decode as black and
 * white even though the composed page paints them in colour. Compare each raw
 * asset with its exact page-render region and use a padded colour crop when
 * that composed result carries materially more chroma. */
async function refinePageAssets(
  assets: ExtractedPageAsset[],
  source: Blob,
  sourceWidth: number,
  sourceHeight: number,
  textBlocks: ExtractedLayoutBlock[],
) {
  if (!assets.length) return assets;
  const bitmap = await createImageBitmap(source);
  try {
    const scaleX = bitmap.width / sourceWidth;
    const scaleY = bitmap.height / sourceHeight;
    const refined: ExtractedPageAsset[] = [];
    for (const asset of assets) {
      const hasOverlayText = textBlocks.some((block) =>
        cropObscuresText(asset.bounds, block.bbox),
      );
      const sx = Math.max(0, Math.floor(asset.bounds.x * scaleX));
      const sy = Math.max(0, Math.floor(asset.bounds.y * scaleY));
      const right = Math.min(
        bitmap.width,
        Math.ceil((asset.bounds.x + asset.bounds.w) * scaleX),
      );
      const bottom = Math.min(
        bitmap.height,
        Math.ceil((asset.bounds.y + asset.bounds.h) * scaleY),
      );
      const sw = right - sx;
      const sh = bottom - sy;
      if (sw < 2 || sh < 2) continue;
      const composed = document.createElement("canvas");
      composed.width = sw;
      composed.height = sh;
      const context = composed.getContext("2d", { willReadFrequently: true });
      if (!context) {
        refined.push(asset);
        continue;
      }
      context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      removeWatermarkPixels(context, sw, sh);
      const composedPixels = context.getImageData(0, 0, sw, sh);
      let nativeChroma = 0;
      try {
        const native = await createImageBitmap(asset.blob);
        try {
          if (
            !asset.id.includes("composite-example") &&
            !asset.id.includes("composite-activity-diagram") &&
            (native.width < 48 || native.height < 48)
          ) {
            // Small repeated teaching objects (fruit, counters, pencils, and
            // similar exercise artwork) are already valid native assets. They
            // do not need chroma refinement, but they must remain available to
            // Storyboard instead of silently disappearing from a row.
            refined.push(asset);
            continue;
          }
          const sample = document.createElement("canvas");
          sample.width = Math.min(96, native.width);
          sample.height = Math.min(96, native.height);
          const sampleContext = sample.getContext("2d", {
            willReadFrequently: true,
          });
          if (sampleContext) {
            sampleContext.drawImage(native, 0, 0, sample.width, sample.height);
            const nativePixels = sampleContext.getImageData(
              0,
              0,
              sample.width,
              sample.height,
            );
            nativeChroma = imageChroma(nativePixels);
          }
        } finally {
          native.close();
        }
      } catch {
        nativeChroma = 0;
      }
      if (hasOverlayText && nativeChroma < 8) {
        // Achromatic PDF regions beneath selectable text are panel masks/page
        // furniture, not illustrations. Keeping them caused black rectangles
        // behind HTML text on later pages. Recreate their surface with CSS.
        continue;
      }
      if (hasOverlayText) {
        refined.push(asset);
        continue;
      }

      const visible = visiblePixelBounds(composedPixels, sw, sh);
      const padding = Math.max(2, Math.round(Math.min(sw, sh) * 0.02));
      const left = Math.max(0, visible ? visible.x - padding : 0);
      const top = Math.max(0, visible ? visible.y - padding : 0);
      const cropRight = Math.min(
        sw,
        visible ? visible.x + visible.w + padding : sw,
      );
      const cropBottom = Math.min(
        sh,
        visible ? visible.y + visible.h + padding : sh,
      );
      const cropWidth = Math.max(1, cropRight - left);
      const cropHeight = Math.max(1, cropBottom - top);
      const crop = document.createElement("canvas");
      crop.width = cropWidth;
      crop.height = cropHeight;
      crop
        .getContext("2d")
        ?.drawImage(
          composed,
          left,
          top,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight,
        );
      const blob = await new Promise<Blob | null>((resolve) =>
        crop.toBlob(resolve, "image/png", 0.96),
      );
      if (!blob) {
        refined.push(asset);
        continue;
      }
      const bounds = {
        x: asset.bounds.x + left / scaleX,
        y: asset.bounds.y + top / scaleY,
        w: cropWidth / scaleX,
        h: cropHeight / scaleY,
      };
      refined.push({
        ...asset,
        blob,
        bytes: await blob.arrayBuffer(),
        bounds,
        containsText: false,
      });
    }
    return deduplicateAssets(refined);
  } finally {
    bitmap.close();
  }
}

function isPrinterControlRegion(
  bounds: { x: number; y: number; w: number; h: number },
  pageWidth: number,
  pageHeight: number,
) {
  const nearHorizontalEdge =
    bounds.y <= pageHeight * 0.045 || bounds.y + bounds.h >= pageHeight * 0.955;
  const thinStrip =
    bounds.h <= pageHeight * 0.15 && bounds.w >= pageWidth * 0.12;
  return nearHorizontalEdge && thinStrip;
}
function isHairlineVisual(
  bounds: { x: number; y: number; w: number; h: number },
  pageWidth: number,
  pageHeight: number,
) {
  const widthRatio = Math.abs(bounds.w) / Math.max(1, pageWidth);
  const heightRatio = Math.abs(bounds.h) / Math.max(1, pageHeight);
  return (
    (widthRatio > 0.12 && heightRatio < 0.025) ||
    (heightRatio > 0.12 && widthRatio < 0.025)
  );
}

function removeWatermarkPixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const watermark = (offset: number) => {
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    return (
      r >= 235 &&
      g >= 145 &&
      b >= 145 &&
      r - g >= 20 &&
      r - g <= 92 &&
      r - b >= 20 &&
      r - b <= 92 &&
      saturation <= 92
    );
  };
  const original = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!watermark(offset)) continue;
      const replacements: Array<{ offset: number; brightness: number }> = [];
      for (let radius = 2; radius <= 10; radius += 2) {
        for (const [nx, ny] of [
          [x - radius, y],
          [x + radius, y],
          [x, y - radius],
          [x, y + radius],
        ]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const candidate = (ny * width + nx) * 4;
          const r = original[candidate] ?? 0;
          const g = original[candidate + 1] ?? 0;
          const b = original[candidate + 2] ?? 0;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          const isWatermark =
            r >= 235 &&
            g >= 145 &&
            b >= 145 &&
            r - g >= 20 &&
            r - g <= 92 &&
            r - b >= 20 &&
            r - b <= 92 &&
            saturation <= 92;
          const brightness = (r + g + b) / 3;
          if (!isWatermark && brightness > 120)
            replacements.push({ offset: candidate, brightness });
        }
      }
      replacements.sort((a, b) => a.brightness - b.brightness);
      const replacement =
        replacements[Math.floor(replacements.length / 2)]?.offset ?? -1;
      if (replacement >= 0) {
        data[offset] = original[replacement]!;
        data[offset + 1] = original[replacement + 1]!;
        data[offset + 2] = original[replacement + 2]!;
      }
    }
  context.putImageData(image, 0, 0);
}

function imageChroma(image: ImageData) {
  let total = 0;
  let samples = 0;
  const stride = Math.max(1, Math.floor((image.width * image.height) / 4096));
  for (let index = 0; index < image.width * image.height; index += stride) {
    const offset = index * 4;
    const r = image.data[offset] ?? 255;
    const g = image.data[offset + 1] ?? 255;
    const b = image.data[offset + 2] ?? 255;
    if ((r + g + b) / 3 > 248) continue;
    total += Math.max(r, g, b) - Math.min(r, g, b);
    samples += 1;
  }
  return samples ? total / samples : 0;
}

function deduplicateAssets(assets: ExtractedPageAsset[]) {
  const kept: ExtractedPageAsset[] = [];
  for (const asset of assets.sort(
    (a, b) => b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h,
  )) {
    if (
      kept.some(
        (candidate) => overlapRatio(candidate.bounds, asset.bounds) > 0.9,
      )
    )
      continue;
    kept.push(asset);
  }
  return kept.sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );
}

async function detectVisualRegions(
  source: Blob,
  sourceWidth: number,
  sourceHeight: number,
) {
  const bitmap = await createImageBitmap(source);
  try {
    const width = 192;
    const height = Math.max(
      96,
      Math.round((width * bitmap.height) / bitmap.width),
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let index = 0; index < mask.length; index += 1) {
      const r = pixels[index * 4] ?? 255;
      const g = pixels[index * 4 + 1] ?? 255;
      const b = pixels[index * 4 + 2] ?? 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;
      const brightness = (r + g + b) / 3;
      if (saturation > 24 || brightness < 70) mask[index] = 1;
    }
    const visited = new Uint8Array(mask.length);
    const regions: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let cursor = 0;
      let count = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      while (cursor < queue.length) {
        const index = queue[cursor++]!;
        count += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = ny * width + nx;
            if (mask[next] && !visited[next]) {
              visited[next] = 1;
              queue.push(next);
            }
          }
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const boxCoverage = (boxWidth * boxHeight) / (width * height);
      if (
        count / (width * height) < 0.004 ||
        boxCoverage < 0.012 ||
        boxWidth < 8 ||
        boxHeight < 8 ||
        boxCoverage > 0.5
      )
        continue;
      regions.push({
        x: (minX / width) * sourceWidth,
        y: (minY / height) * sourceHeight,
        w: (boxWidth / width) * sourceWidth,
        h: (boxHeight / height) * sourceHeight,
      });
    }
    return regions.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 8);
  } finally {
    bitmap.close();
  }
}

function overlapRatio(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const width = Math.max(
    0,
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  );
  return (
    (width * height) /
    Math.max(1, Math.min(Math.abs(a.w * a.h), Math.abs(b.w * b.h)))
  );
}

function regionTextCoverage(
  region: { x: number; y: number; w: number; h: number },
  textRegions: Array<{ x: number; y: number; w: number; h: number }>,
) {
  const area = Math.max(1, Math.abs(region.w * region.h));
  const overlapArea = textRegions.reduce((total, text) => {
    const width = Math.max(
      0,
      Math.min(region.x + region.w, text.x + text.w) -
        Math.max(region.x, text.x),
    );
    const height = Math.max(
      0,
      Math.min(region.y + region.h, text.y + text.h) -
        Math.max(region.y, text.y),
    );
    return total + width * height;
  }, 0);
  return Math.min(1, overlapArea / area);
}

function StageTaskStatus({
  active,
  progress,
  running,
  stopped,
}: {
  active: StageSlug;
  progress: number;
  running: boolean;
  stopped: boolean;
}) {
  const tasks = stageTasks[active];
  const completed =
    progress >= 100
      ? tasks.length
      : Math.floor((progress / 100) * tasks.length);
  return (
    <div
      className="mt-5 flex flex-wrap gap-2"
      aria-label={`${stages.find((stage) => stage.slug === active)?.label} tasks`}
    >
      {tasks.map((task, index) => {
        const state =
          index < completed
            ? "complete"
            : running && index === completed
              ? "running"
              : stopped && index === completed
                ? "stopped"
                : "queued";
        return (
          <Badge
            className="gap-1.5 py-1.5"
            key={task}
            variant={
              state === "complete"
                ? "secondary"
                : state === "running"
                  ? "default"
                  : "outline"
            }
          >
            {state === "complete" ? (
              <Check />
            ) : state === "running" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Circle />
            )}
            {task}
            <span className="sr-only"> · {state}</span>
          </Badge>
        );
      })}
    </div>
  );
}

function ExtractionWorkspace({
  book,
  onChange,
}: {
  book: DeviceBook;
  onChange: Props["onChange"];
}) {
  const [additionalRangeStart, setAdditionalRangeStart] = useState("1");
  const [additionalRangeEnd, setAdditionalRangeEnd] = useState("1");
  const [addPagesOpen, setAddPagesOpen] = useState(false);
  const [runMode, setRunMode] = useState<"added" | "all">(
    book.conversionConfig?.rangeRunMode ?? "added",
  );
  const convertedPages = (book.extractedPages ?? [])
    .map((page) => page.number)
    .sort((a, b) => a - b);
  async function saveAdditionalRanges() {
    if (!book.conversionConfig || !book.sourceTotalPages) return;
    const from = Math.min(
      Number(additionalRangeStart),
      Number(additionalRangeEnd),
    );
    const to = Math.max(
      Number(additionalRangeStart),
      Number(additionalRangeEnd),
    );
    const additionalRanges = from === to ? String(from) : `${from}-${to}`;
    const added = selectedSourcePages(book.sourceTotalPages, {
      ...book.conversionConfig,
      scope: "split",
      pageParts: additionalRanges,
    });
    if (!added.length) {
      toast.error("Enter at least one valid page or page range.");
      return;
    }
    const merged = [...new Set([...convertedPages, ...added])].sort(
      (a, b) => a - b,
    );
    await onChange(
      {
        ...book,
        conversionConfig: {
          ...book.conversionConfig,
          scope: "split",
          pageParts: collapsePageRanges(merged),
          rangeRunMode: runMode,
        },
        totalPages: merged.length,
        stageProgress: {
          ...book.stageProgress,
          extract: Math.round((convertedPages.length / merged.length) * 100),
          structure: Math.round(
            ((book.structuredPages?.length ?? 0) / merged.length) * 100,
          ),
          storyboard: Math.round(
            ((book.storyboardPages?.length ?? 0) / merged.length) * 100,
          ),
          "image-captioning": 0,
          "easy-read": 0,
          language: 0,
          speech: 0,
          "sign-language": 0,
          validate: 0,
          export: 0,
        },
      },
      `Added source ranges ${additionalRanges}`,
    );
    toast.success(
      runMode === "added"
        ? "Ranges added. Run Extraction to process only pages not already converted."
        : "Ranges added. The next Extraction run will rebuild every selected page.",
    );
    setAddPagesOpen(false);
  }
  return (
    <div className="mt-6">
      {book.sourceTotalPages &&
      (book.conversionConfig?.scope === "split" ||
        convertedPages.length < book.sourceTotalPages) ? (
        <div className="mb-6 flex justify-end">
          <Button onClick={() => setAddPagesOpen(true)} variant="outline">
            Add pages
          </Button>
          <Dialog onOpenChange={setAddPagesOpen} open={addPagesOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add pages</DialogTitle>
                <DialogDescription>
                  Extend this split conversion without losing completed pages.
                  Already converted: {collapsePageRanges(convertedPages) || "none"}.
                </DialogDescription>
              </DialogHeader>
              <Button
                onClick={() => {
                  const converted = new Set(convertedPages);
                  const start = Array.from(
                    { length: book.sourceTotalPages ?? 0 },
                    (_, index) => index + 1,
                  ).find((page) => !converted.has(page));
                  if (!start) return;
                  let end = start;
                  while (
                    end < (book.sourceTotalPages ?? start) &&
                    end - start < 19 &&
                    !converted.has(end + 1)
                  ) {
                    end += 1;
                  }
                  setAdditionalRangeStart(String(start));
                  setAdditionalRangeEnd(String(end));
                }}
                type="button"
                variant="secondary"
              >
                Select next 20 unconverted pages
              </Button>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Start page</FieldLabel>
                    <Select
                      onValueChange={(value) => {
                        const previousStart = Number(additionalRangeStart);
                        const nextStart = Number(value);
                        setAdditionalRangeStart(value);
                        if (
                          nextStart > Number(additionalRangeEnd) ||
                          Number(additionalRangeEnd) === previousStart
                        ) {
                          setAdditionalRangeEnd(
                            String(
                              Math.min(
                                nextStart + 19,
                                book.sourceTotalPages ?? nextStart,
                              ),
                            ),
                          );
                        }
                      }}
                      value={additionalRangeStart}
                    >
                      <SelectTrigger className="w-full pr-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Array.from({ length: book.sourceTotalPages }, (_, index) => index + 1).map((page) => (
                            <SelectItem key={page} value={String(page)}>{page}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>End page</FieldLabel>
                    <Select onValueChange={setAdditionalRangeEnd} value={additionalRangeEnd}>
                      <SelectTrigger className="w-full pr-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Array.from({ length: book.sourceTotalPages }, (_, index) => index + 1).map((page) => (
                            <SelectItem key={page} value={String(page)}>{page}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Next pipeline run</FieldLabel>
                  <Select onValueChange={(value) => setRunMode(value as "added" | "all")} value={runMode}>
                    <SelectTrigger className="w-full pr-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="added">Only newly added pages</SelectItem>
                        <SelectItem value="all">Repeat all selected pages</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={() => void saveAdditionalRanges()}>Add selected pages</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Extracted pages</CardTitle>
          <CardDescription>
            {book.extractedPages?.length ?? 0} of {book.totalPages ?? "—"}{" "}
            persisted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[42rem]">
            {book.extractedPages?.length ? (
              <ol className="grid gap-4 pr-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {book.extractedPages.map((page) => (
                  <ExtractedPageCard key={page.number} page={page} />
                ))}
              </ol>
            ) : (
              <div className="grid min-h-80 place-items-center text-center text-sm text-muted-foreground">
                <span>
                  Run Extraction to begin. Each completed page will appear here
                  immediately with its rendered page image and extracted text.
                </span>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function collapsePageRanges(pages: number[]) {
  if (!pages.length) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0]!;
  let previous = start;
  for (const page of sorted.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = previous = page;
  }
  ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  return ranges.join(", ");
}
function ExtractedPageCard({
  page,
}: {
  page: NonNullable<DeviceBook["extractedPages"]>[number];
}) {
  const url = useObjectUrl(page.thumbnail);
  return (
    <li className="overflow-hidden rounded-xl border bg-background studio-enter">
      <div className="relative aspect-[3/4] bg-muted/20">
        {url ? (
          <Image
            alt={`Extracted page ${page.number}`}
            className="object-contain"
            fill
            sizes="(max-width: 768px) 50vw, 240px"
            src={url}
            unoptimized
          />
        ) : null}
      </div>
      <div className="border-t p-3">
        <div className="flex items-center justify-between">
          <strong className="text-sm">Page {page.number}</strong>
          <Check className="size-4 text-primary" />
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {page.text?.trim() || "No embedded text detected"}
        </p>
      </div>
    </li>
  );
}
const readingLevels: Array<{
  value: ReadingLevel;
  label: string;
  description: string;
  icon: typeof Sprout;
}> = [
  {
    value: "early",
    label: "Early",
    description: "Short sentences and familiar primary-level words.",
    icon: Sprout,
  },
  {
    value: "middle",
    label: "Middle",
    description: "Clear descriptions for developing readers.",
    icon: BookOpen,
  },
  {
    value: "late",
    label: "Late",
    description: "Detailed plain language with subject vocabulary.",
    icon: GraduationCap,
  },
];

function ReadingLevelSelector({
  book,
  onChange,
}: {
  book: DeviceBook;
  onChange: Props["onChange"];
}) {
  const selected = book.readingLevel ?? "middle";
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Audience reading level</CardTitle>
        <CardDescription>
          This shared setting guides image descriptions and their Easy Read
          alternatives. Changing it marks both stages for rerun.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          className="grid w-full gap-3 md:grid-cols-3"
          onValueChange={(value) => {
            if (!value || value === selected) return;
            void onChange(
              {
                ...book,
                readingLevel: value as ReadingLevel,
                captionedPageNumbers: [],
                easyReadCatalog: [],
                stageProgress: {
                  ...book.stageProgress,
                  "image-captioning": 0,
                  "easy-read": 0,
                },
              },
              `Changed reading level to ${value}`,
            );
          }}
          type="single"
          value={selected}
          variant="outline"
        >
          {readingLevels.map((option) => {
            const Icon = option.icon;
            return (
              <ToggleGroupItem
                aria-label={`Use ${option.label} reading level`}
                className="h-auto min-h-24 items-start justify-start gap-3 whitespace-normal p-4 text-left"
                key={option.value}
                value={option.value}
              >
                <Icon className="mt-0.5 shrink-0" />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="mt-1 block text-sm font-normal text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}

function StageOutput({ book, stage }: { book: DeviceBook; stage: StageSlug }) {
  const rows =
    stage === "image-captioning"
      ? (book.imageCaptions ?? []).map((caption) => ({
          id: caption.imageId,
          pageNumber: caption.pageNumber,
          text: caption.caption,
        }))
      : stage === "easy-read"
        ? (book.easyReadCatalog ?? [])
        : [];
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Stage workspace</CardTitle>
        <CardDescription>
          Outputs from {stage} are stored incrementally and can be rerun without
          rebuilding earlier stages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.slice(0, 50).map((row) => (
            <Card key={row.id} size="sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>
                    {stage === "easy-read" ? "Easy Read image caption" : "Image description"}
                  </CardTitle>
                  <Badge variant="outline">Page {row.pageNumber}</Badge>
                </div>
                <CardDescription className="line-clamp-3">
                  {row.text}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        {!rows.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Run {stages.find((item) => item.slug === stage)?.label} to create
            its persisted outputs.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StoryboardAssistant({
  book,
  onChange,
  onOpenChange,
  open,
  providerKeys,
  onRerenderStateChange,
}: {
  book: DeviceBook;
  onChange: Props["onChange"];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  providerKeys?: ProviderKeys;
  onRerenderStateChange: (pages: number[]) => void;
}) {
  const [text, setText] = useState("");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [thinking, setThinking] = useState(false);
  const [streamed, setStreamed] = useState("");
  const streamTimer = useRef<number | undefined>(undefined);
  const [assistantPortal, setAssistantPortal] = useState<HTMLDivElement | null>(
    null,
  );
  const prompts = book.correctionPrompts ?? [];
  const messages = book.assistantMessages ?? [];
  useEffect(
    () => () => {
      if (streamTimer.current) window.clearInterval(streamTimer.current);
    },
    [],
  );
  async function send() {
    if (!text.trim() || thinking) return;
    const prefix = selectedPages.length
      ? `${selectedPages.map((number) => `@Page ${number}`).join(" ")} `
      : "";
    const instruction = `${prefix}${text.trim()}`;
    const now = new Date().toISOString();
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      text: instruction,
      createdAt: now,
    };
    const selectedPage = selectedPages[0];
    const queuedPrompt = {
      id: crypto.randomUUID(),
      text: instruction,
      status: prompts.length ? ("queued" as const) : ("next" as const),
      createdAt: now,
      pageNumber: selectedPage,
      scope: selectedPages.length ? ("page" as const) : ("book" as const),
    };
    const nextBook = {
      ...book,
      assistantMessages: [...messages, userMessage],
      correctionPrompts: [...prompts, queuedPrompt],
    };
    await onChange(
      nextBook,
      selectedPages.length
        ? `Prepared correction for pages ${selectedPages.join(", ")}`
        : "Queued storyboard correction",
    );
    setText("");
    setThinking(true);
    setStreamed("");
    const replyPromise = providerKeys
      ? generateStoryboardAssistantReply(providerKeys, messages, instruction)
      : Promise.resolve("");
    let response: string;
    const updatedBook: DeviceBook = nextBook;
    const replyResult = await Promise.allSettled([replyPromise]).then(
      (results) => results[0]!,
    );
    try {
      response = replyResult.status === "fulfilled" ? replyResult.value : "";
      if (!response.trim())
        throw new Error("The assistant returned an empty response.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The assistant could not respond online.",
      );
      response =
        selectedPages.length === 0
          ? `*Instruction understood.*\n\nI added it to the storyboard correction queue. When Storyboard runs, I’ll apply it across the relevant pages while preserving the source book’s layout and accessibility structure.`
          : `*Pages ${selectedPages.join(", ")} are ready.*\n\nI’ll use each page's extracted image, layout geometry, semantic structure, and original visual assets. Review this plan, then choose *Apply and re-render* below.`;
    }
    setThinking(false);
    let cursor = 0;
    await new Promise<void>((resolve) => {
      streamTimer.current = window.setInterval(() => {
        cursor = Math.min(
          response.length,
          cursor + Math.max(1, Math.ceil(response.length / 42)),
        );
        setStreamed(response.slice(0, cursor));
        if (cursor >= response.length) {
          window.clearInterval(streamTimer.current);
          streamTimer.current = undefined;
          resolve();
        }
      }, 28);
    });
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      text: response,
      createdAt: new Date().toISOString(),
      pageNumbers: [...selectedPages],
      canApply: selectedPages.length > 0,
      instruction,
    };
    await onChange(
      {
        ...updatedBook,
        assistantMessages: [
          ...(updatedBook.assistantMessages ?? []),
          assistantMessage,
        ],
      },
      selectedPages.length
        ? `Assistant prepared pages ${selectedPages.join(", ")}`
        : "Assistant acknowledged storyboard correction",
    );
    setStreamed("");
  }

  async function applyMessage(
    message: NonNullable<DeviceBook["assistantMessages"]>[number],
  ) {
    if (!message.pageNumbers?.length || thinking) return;
    if (!providerKeys) {
      toast.error(
        "Configure an AI provider before applying storyboard changes.",
      );
      return;
    }
    const targetPages = [...message.pageNumbers];
    onOpenChange(false);
    onRerenderStateChange(targetPages);
    setThinking(true);
    let working = book;
    try {
      for (const pageNumber of message.pageNumbers) {
        const current = working.storyboardPages?.find(
          (item) => item.pageNumber === pageNumber,
        );
        if (current)
          working = {
            ...working,
            storyboardPageRevisions: [
              ...(working.storyboardPageRevisions ?? []),
              {
                id: crypto.randomUUID(),
                pageNumber,
                createdAt: new Date().toISOString(),
                summary: message.text.slice(0, 100),
                page: current,
              },
            ],
          };
        working = await rerenderPageFromAssistant(
          working,
          pageNumber,
          message.instruction ?? message.text,
          `assistant-${message.id}-${pageNumber}`,
          providerKeys,
        );
        await onChange(working, `Re-rendered storyboard page ${pageNumber}`);
      }
      working = {
        ...working,
        correctionPrompts: (working.correctionPrompts ?? []).filter(
          (prompt) => prompt.text !== message.instruction,
        ),
        assistantMessages: (working.assistantMessages ?? []).map((item) =>
          item.id === message.id ? { ...item, canApply: false } : item,
        ),
      };
      await onChange(
        working,
        `Applied assistant changes to pages ${message.pageNumbers.join(", ")}`,
      );
      toast.success(
        `Re-rendered ${message.pageNumbers.length} selected page${message.pageNumbers.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The selected pages could not be re-rendered.",
      );
    } finally {
      setThinking(false);
      onRerenderStateChange([]);
    }
  }
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-full flex-col sm:max-w-lg"
        ref={setAssistantPortal}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquareText />
            Storyboard assistant
          </SheetTitle>
          <SheetDescription>
            Chat with Litera about layouts, accessibility, content, or a
            specific source page.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4">
          <div className="flex flex-col gap-4 py-4">
            {messages.length ? (
              messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  onApply={
                    message.canApply
                      ? () => void applyMessage(message)
                      : undefined
                  }
                />
              ))
            ) : (
              <div className="grid min-h-72 place-items-center text-center text-sm text-muted-foreground">
                <span>
                  <MessageSquareText className="mx-auto mb-3" />
                  Ask Litera to correct layouts, content, accessibility, or a
                  specific page.
                </span>
              </div>
            )}
            {thinking ? (
              <div
                className="flex w-fit max-w-[82%] self-start items-center gap-1 rounded-2xl rounded-bl-sm border bg-muted/50 px-4 py-3"
                aria-label="Litera is thinking"
              >
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-.3s]" />
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-.15s]" />
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            ) : null}
            {streamed ? (
              <ChatBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  text: streamed,
                  createdAt: new Date().toISOString(),
                }}
                streaming
              />
            ) : null}
          </div>
        </ScrollArea>
        <div className="border-t p-4">
          <div className="rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
            <Textarea
              className="min-h-24 resize-none border-0 shadow-none focus-visible:ring-0"
              onChange={(event) => setText(event.target.value)}
              placeholder="Describe a storyboard correction…"
              value={text}
            />
            <div className="flex items-center justify-between gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className="max-w-56 justify-start"
                    size="sm"
                    variant="ghost"
                  >
                    {selectedPages.length
                      ? `${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"} selected`
                      : "Select pages"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-64 p-2"
                  portalContainer={assistantPortal}
                >
                  <div
                    className="max-h-64 touch-pan-y overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
                    data-page-picker-scroll
                    onWheel={(event) => event.stopPropagation()}
                  >
                    <div className="flex flex-col gap-1">
                      {(book.extractedPages ?? []).map((item) => (
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                          key={item.number}
                        >
                          <Checkbox
                            checked={selectedPages.includes(item.number)}
                            onCheckedChange={(checked) =>
                              setSelectedPages((current) =>
                                checked
                                  ? [...current, item.number].sort(
                                      (a, b) => a - b,
                                    )
                                  : current.filter(
                                      (number) => number !== item.number,
                                    ),
                              )
                            }
                          />
                          <span>Page {item.number}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Send prompt"
                    disabled={!text.trim() || thinking || Boolean(streamed)}
                    onClick={() => void send()}
                    size="icon-sm"
                  >
                    <ArrowUp />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send to queue</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChatBubble({
  message,
  onApply,
  streaming = false,
}: {
  message: NonNullable<DeviceBook["assistantMessages"]>[number];
  onApply?: () => void;
  streaming?: boolean;
}) {
  const user = message.role === "user";
  return (
    <div className={cn("flex", user ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          user
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border bg-muted/40",
        )}
      >
        <RichChatText text={message.text} />
        {onApply ? (
          <Button className="mt-3 w-full" onClick={onApply} size="sm">
            <Sparkles data-icon="inline-start" />
            Apply and re-render{" "}
            {message.pageNumbers?.length === 1
              ? `page ${message.pageNumbers[0]}`
              : `${message.pageNumbers?.length} pages`}
          </Button>
        ) : null}
        <div
          className={cn(
            "mt-1.5 flex items-center justify-end gap-1 text-[10px]",
            user ? "text-primary-foreground/65" : "text-muted-foreground",
          )}
        >
          {streaming
            ? "Typing…"
            : new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
          {user ? <Check className="size-3" /> : null}
        </div>
      </div>
    </div>
  );
}

function RichChatText({ text }: { text: string }) {
  return (
    <div className="space-y-2 whitespace-pre-wrap leading-6">
      {text.split("\n").map((line, index) => {
        if (!line) return <div className="h-1" key={index} />;
        if (/^[-*] /.test(line))
          return (
            <div className="flex gap-2" key={index}>
              <span>•</span>
              <span>{formatChatInline(line.slice(2))}</span>
            </div>
          );
        if (/^> /.test(line))
          return (
            <blockquote
              className="border-l-2 border-current/40 pl-3 opacity-90"
              key={index}
            >
              {formatChatInline(line.slice(2))}
            </blockquote>
          );
        return <p key={index}>{formatChatInline(line)}</p>;
      })}
    </div>
  );
}

function formatChatInline(value: string): ReactNode[] {
  const tokens = value
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|~[^~]+~|`[^`]+`)/g)
    .filter(Boolean);
  return tokens.map((token, index) =>
    token.startsWith("**") && token.endsWith("**") ? (
      <strong key={index}>{token.slice(2, -2)}</strong>
    ) : token.startsWith("*") && token.endsWith("*") ? (
      <strong key={index}>{token.slice(1, -1)}</strong>
    ) : token.startsWith("_") && token.endsWith("_") ? (
      <em key={index}>{token.slice(1, -1)}</em>
    ) : token.startsWith("~") && token.endsWith("~") ? (
      <s key={index}>{token.slice(1, -1)}</s>
    ) : token.startsWith("`") && token.endsWith("`") ? (
      <code
        className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[.9em]"
        key={index}
      >
        {token.slice(1, -1)}
      </code>
    ) : (
      token
    ),
  );
}
function VersionHistory({
  book,
  onChange,
  onOpenChange,
  open,
}: {
  book: DeviceBook;
  onChange: Props["onChange"];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [restore, setRestore] =
    useState<NonNullable<DeviceBook["versions"]>[number]>();
  return (
    <>
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Version history</SheetTitle>
            <SheetDescription>
              Every saved workspace change creates a local restore point.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="grid gap-2 py-4">
              {book.versions?.map((version) => (
                <button
                  className="flex items-start gap-3 rounded-xl border p-4 text-left hover:border-primary/30"
                  key={version.id}
                  onClick={() => setRestore(version)}
                  type="button"
                >
                  <History className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <strong className="block">Version {version.number}</strong>
                    <span className="block text-sm text-muted-foreground">
                      {version.summary}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <RotateCcw />
                </button>
              )) ?? (
                <p className="text-sm text-muted-foreground">
                  The first saved change will appear here.
                </p>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={Boolean(restore)}
        onOpenChange={(value) => !value && setRestore(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore version {restore?.number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new version from the selected stage progress;
              existing history remains available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                restore &&
                void onChange(
                  {
                    ...book,
                    currentStage: restore.stage,
                    stageProgress: restore.stageProgress,
                  },
                  `Restored version ${restore.number}`,
                )
              }
            >
              Restore version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function extractionProgress(book: DeviceBook) {
  return book.totalPages
    ? Math.round(((book.extractedPages?.length ?? 0) / book.totalPages) * 100)
    : (book.stageProgress?.extract ?? 0);
}
function performanceDelay(mode: DeviceBook["performanceMode"]) {
  return mode === "eco" ? 1200 : mode === "maximum" ? 250 : 650;
}

function selectVisionProvider(keys: ProviderKeys): ProviderId {
  const supported: ProviderId[] = ["gemini", "openai", "anthropic"];
  const routed = loadProviderRouting().vision;
  if (routed && supported.includes(routed) && keys[routed]) return routed;
  const available = supported.find((provider) => Boolean(keys[provider]));
  if (!available)
    throw new Error(
      "Unlock an OpenAI, Gemini, or Anthropic vision key before running Storyboard.",
    );
  return available;
}

function selectTranslationProvider(keys: ProviderKeys): ProviderId {
  const supported: ProviderId[] = ["openai", "gemini", "anthropic"];
  const routed = loadProviderRouting().translation;
  if (routed && supported.includes(routed) && keys[routed]) return routed;
  const available = supported.find((provider) => Boolean(keys[provider]));
  if (!available)
    throw new Error(
      "Unlock an OpenAI, Gemini, or Anthropic key before running Language.",
    );
  return available;
}

function selectSpeechProvider(keys: ProviderKeys): ProviderId {
  const supported: ProviderId[] = ["openai", "gemini"];
  const routed = loadProviderRouting().speech;
  if (routed && supported.includes(routed) && keys[routed]) return routed;
  const available = supported.find((provider) => Boolean(keys[provider]));
  if (!available)
    throw new Error("Unlock an OpenAI or Gemini key before running Speech.");
  return available;
}

function baseLanguage(language: string) {
  return language.toLowerCase().split(/[-_]/)[0];
}

function completePipelineSteps(
  current: DeviceBook["pipelineSteps"],
  steps: Array<keyof NonNullable<DeviceBook["pipelineSteps"]>>,
  status: "complete" | "stopped",
) {
  const updatedAt = new Date().toISOString();
  return Object.fromEntries([
    ...Object.entries(current ?? {}),
    ...steps.map((step) => [
      step,
      { status, progress: status === "complete" ? 100 : 0, updatedAt },
    ]),
  ]) as NonNullable<DeviceBook["pipelineSteps"]>;
}
function queuePipelineSteps(
  current: DeviceBook["pipelineSteps"],
  steps: Array<keyof NonNullable<DeviceBook["pipelineSteps"]>>,
) {
  const updatedAt = new Date().toISOString();
  return Object.fromEntries([
    ...Object.entries(current ?? {}),
    ...steps.map((step) => [
      step,
      { status: "queued" as const, progress: 0, updatedAt },
    ]),
  ]) as NonNullable<DeviceBook["pipelineSteps"]>;
}
function runPipelineStep(
  current: DeviceBook["pipelineSteps"],
  step: keyof NonNullable<DeviceBook["pipelineSteps"]>,
  message: string,
) {
  return {
    ...(current ?? {}),
    [step]: {
      status: "running" as const,
      progress: 0,
      message,
      updatedAt: new Date().toISOString(),
    },
  } as NonNullable<DeviceBook["pipelineSteps"]>;
}
function detectSourceLanguage(text: string, configured?: string) {
  if (configured && configured !== "auto") return configured;
  const sample = text.toLowerCase();
  if (/\b(na|kwa|ya|katika|hii|hivyo|mwanafunzi)\b/.test(sample))
    return "sw-TZ";
  if (/\b(le|la|les|des|une|est)\b/.test(sample)) return "fr";
  if (/[\u0600-\u06ff]/.test(sample)) return "ar";
  return "en";
}
function summarizeBook(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean
    ? clean.slice(0, 600) + (clean.length > 600 ? "…" : "")
    : "No embedded source text was detected.";
}
function buildImageCaptions(book: DeviceBook) {
  return (book.storyboardPages ?? []).flatMap((page) =>
    page.blocks
      .filter((block) => block.kind === "image" && block.assetId)
      .map((block) => ({
        imageId: block.assetId!,
        pageNumber: page.pageNumber,
        caption: cleanImageCaption(
          block.accessibleLabel ||
            block.content ||
            `Visual on page ${page.pageNumber}`,
        ),
      })),
  );
}
function applyImageCaptions(
  page: NonNullable<DeviceBook["storyboardPages"]>[number],
  captions: Array<{ imageId: string; caption: string }>,
) {
  const byId = new Map(
    captions.map((caption) => [caption.imageId, cleanImageCaption(caption.caption)]),
  );
  const blocks = page.blocks.map((block) => {
    const caption = block.assetId ? byId.get(block.assetId) : undefined;
    return caption
      ? { ...block, content: caption, accessibleLabel: caption }
      : block;
  });
  if (typeof DOMParser === "undefined") return { ...page, blocks };
  const document = new DOMParser().parseFromString(page.html, "text/html");
  for (const figure of document.querySelectorAll<HTMLElement>(
    "figure[data-asset-id]",
  )) {
    if (figure.getAttribute("aria-hidden") === "true") continue;
    const caption = byId.get(figure.dataset.assetId ?? "");
    if (!caption) continue;
    const image = figure.querySelector("img");
    if (
      /(?:decorative|page)\s+(?:left |right )?(?:border|band|edge|footer|header)/i.test(
        caption,
      )
    ) {
      figure.setAttribute("aria-hidden", "true");
      if (image) image.alt = "";
      figure.querySelector("figcaption")?.remove();
      continue;
    }
    if (image) image.alt = caption;
    if (!figure.dataset.id) figure.dataset.id = figure.dataset.assetId;
    const figcaption = figure.querySelector("figcaption");
    if (figcaption) figcaption.textContent = caption;
  }
  // Picture-to-number matching (e.g. "draw a line to match the objects and
  // their number") can only be answered correctly once we know how many
  // objects are actually in each picture - and that only becomes available
  // right here, now that captions above have just been written into each
  // figure's alt text. Doing this earlier (at Storyboard time) is why this
  // activity used to fall back to one unusable free-text field.
  finalizeMatchingActivities(document);
  restoreMisidentifiedAnswerImages(document, page.pageNumber);
  insertImageNumberTableAnswers(document, page.pageNumber);
  return {
    ...page,
    blocks,
    html: `<!doctype html>${document.documentElement.outerHTML}`,
  };
}

const captionCountWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function countFromCaption(caption: string) {
  const match = caption
    .toLocaleLowerCase()
    .match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/);
  if (!match) return undefined;
  const token = match[1]!;
  return /^\d+$/.test(token) ? Number(token) : captionCountWords[token];
}

/** Fills in a real per-picture answer key for matching activities that fell
 * back to a single free-text field because no text-based pairs existed at
 * Storyboard time (see matchingPairsFromLayout). Only acts when every
 * picture's caption-derived count maps to exactly one scrambled numeral
 * candidate on the page with no ties - an ambiguous page is left on the
 * fallback for manual review rather than guessing an answer key. */
function finalizeMatchingActivities(document: Document) {
  const fallbackGames = [
    ...document.querySelectorAll<HTMLElement>(".litera-matching-game"),
  ].filter((game) => !game.querySelector(".litera-matching-grid"));
  if (fallbackGames.length !== 1) return;
  const game = fallbackGames[0]!;

  // The worked "Example" row has its own already-answered numeral sitting
  // in the same numeral column as the real questions - excluded above from
  // `resolved` via its image caption, but its numeral must be excluded here
  // too, or the counts will always be one short of a clean bijection. It
  // reliably sits on the same printed line as the "Example"/"Mfano" label.
  const layoutTop = (element: Element) =>
    Number(
      (element.getAttribute("style") ?? "").match(
        /(?:^|;)\s*top\s*:\s*([\d.]+)%/i,
      )?.[1] ?? NaN,
    );
  const exampleTops = [...document.querySelectorAll<HTMLElement>("[data-layout-block]")]
    .filter((element) => /\b(?:example|mfano)\b/i.test(element.textContent ?? ""))
    .map(layoutTop);
  const candidateNumerals = [
    ...document.querySelectorAll<HTMLElement>("[data-layout-block]"),
  ]
    .filter(
      (element) =>
        !exampleTops.some((top) => Math.abs(layoutTop(element) - top) <= 2),
    )
    .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((text) => /^\d{1,3}$/.test(text));
  if (candidateNumerals.length < 2) return;

  const resolved = [
    ...document.querySelectorAll<HTMLElement>("figure[data-asset-id]"),
  ]
    .filter((figure) => figure.getAttribute("aria-hidden") !== "true")
    .map((figure) => {
      const caption = figure.querySelector("img")?.alt?.trim() ?? "";
      return { figure, caption, count: countFromCaption(caption) };
    })
    .filter(
      (item): item is { figure: HTMLElement; caption: string; count: number } =>
        item.count !== undefined && !/\bexample\b/i.test(item.caption),
    );
  if (resolved.length < 2) return;

  // Trust this only when it is a clean bijection: every picture's count
  // appears exactly once among the candidates, and every candidate is used.
  const countTally = new Map<number, number>();
  for (const item of resolved)
    countTally.set(item.count, (countTally.get(item.count) ?? 0) + 1);
  const numeralTally = new Map<number, number>();
  for (const text of candidateNumerals)
    numeralTally.set(Number(text), (numeralTally.get(Number(text)) ?? 0) + 1);
  const cleanBijection =
    resolved.length === candidateNumerals.length &&
    [...countTally.entries()].every(
      ([count, occurrences]) =>
        occurrences === 1 && numeralTally.get(count) === 1,
    );
  if (!cleanBijection) return;

  const activityId =
    game.getAttribute("data-activity-item") ?? "matching-activity";
  const options = [...new Set(candidateNumerals)].sort(
    (a, b) => Number(a) - Number(b),
  );
  resolved.forEach((item, index) => {
    const feedbackId = `${activityId}-picture-feedback-${index + 1}`;
    const control = `<label class="litera-response litera-response--stack"><span>Choose the number that matches this picture</span><select data-correct-answer="${escapeHtmlAttribute(String(item.count))}" aria-label="Choose the number that matches: ${escapeHtmlAttribute(item.caption)}" aria-describedby="${feedbackId}"><option value="">Choose a number</option>${options.map((value) => `<option value="${escapeHtmlAttribute(value)}">${escapeHtmlAttribute(value)}</option>`).join("")}</select><span class="litera-answer-feedback" id="${feedbackId}" aria-live="polite"></span></label>`;
    // Figures carry their own absolute left/top/width/height (same scheme
    // insertActivityControl reads off [data-layout-block] text nodes), so
    // anchor the new select right under its picture instead of leaving it
    // to normal document flow, which would abandon the print layout.
    const style = item.figure.getAttribute("style") ?? "";
    const left = style.match(/(?:^|;)\s*left\s*:\s*([\d.]+%)/i)?.[1] ?? "8%";
    const width = style.match(/(?:^|;)\s*width\s*:\s*([\d.]+%)/i)?.[1] ?? "40%";
    const top = Number(style.match(/(?:^|;)\s*top\s*:\s*([\d.]+)%/i)?.[1] ?? 0);
    const height = Number(
      style.match(/(?:^|;)\s*height\s*:\s*([\d.]+)%/i)?.[1] ?? 4,
    );
    // The first group also carries the bare activity id (matching the
    // fill-blank pattern elsewhere: outer/primary control = bare id, the
    // rest = suffixed) so anything looking up the original activity - the
    // completeness validator included - still finds a live control here
    // instead of the removed .litera-matching-game.
    const groupId = index === 0 ? activityId : `${activityId}-${index + 1}`;
    item.figure.insertAdjacentHTML(
      "afterend",
      `<div class="litera-response-group" data-activity-item="${groupId}" style="left:${left};top:${Math.min(94, top + height + 0.6).toFixed(2)}%;width:${width}">${control}</div>`,
    );
  });
  game.remove();
}

/** buildRepeatedAnswerBoxTargets (geometry-storyboard-engine.ts) assumes any
 * page-wide cluster of same-sized repeated assets is a printed blank
 * answer-box glyph, and glues an answer input directly onto (then hides) each
 * one. On a "count each group and write its number" table, that cluster is
 * often real content clipart instead (e.g. six individual fruit icons), which
 * both destroys the picture the pupil needs to count and never places an
 * answer control for the other rows at all. Captions aren't available yet at
 * Storyboard time to tell the two cases apart, so - like
 * finalizeMatchingActivities above - this runs after captioning, once each
 * hidden figure's real caption is known, and only touches this one
 * proven-buggy evidence type rather than every hiding mechanism. */
function restoreMisidentifiedAnswerImages(document: Document, pageNumber: number) {
  const visibleText = [...document.querySelectorAll<HTMLElement>("[data-layout-block]")]
    .map((element) => element.textContent ?? "")
    .join(" ");
  // Only counting-picture activities can legitimately turn a repeated
  // printed-box cluster back into visible content. On ordinary write-in
  // exercises ("write two in numerals"), captions inherited from the
  // nearest word make the empty boxes look like meaningful illustrations;
  // restoring them creates the duplicate second column seen on page 20.
  if (
    !/\b(?:count|how many|group(?:s)? of|objects?|fruits?|pictures?)\b/i.test(
      visibleText,
    )
  )
    return;
  const labels = [
    ...document.querySelectorAll<HTMLElement>(
      '.source-answer-line[data-placement-evidence="repeated-printed-answer-box"]',
    ),
  ];
  if (!labels.length) return;
  const hiddenIds = new Set<string>();
  for (const style of document.querySelectorAll("style[data-litera-answer-visual-replacement]"))
    for (const match of (style.textContent ?? "").matchAll(
      /figure\[data-asset-id="([^"]+)"\]\{visibility:hidden\}/g,
    ))
      hiddenIds.add(match[1]!);
  if (!hiddenIds.size) return;

  const rect = (element: Element) => {
    const style = element.getAttribute("style") ?? "";
    const num = (property: string) =>
      Number(
        style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([\\d.]+)%`, "i"))?.[1] ?? NaN,
      );
    return { left: num("left"), top: num("top"), width: num("width"), height: num("height") };
  };
  const close = (a: number, b: number, tolerance: number) =>
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
  const placeholderCaption =
    /^visual used in this section|\b(?:blank|empty)\s+(?:box|space|answer)|writing\s+(?:box|line|rule)|answer\s+box|write-in\s+(?:box|line)/i;

  const figures = [...document.querySelectorAll<HTMLElement>("figure[data-asset-id]")];
  // Pair every label with its figure first, regardless of caption quality -
  // a row where the AI captioned only one of several near-identical icons
  // (e.g. one "seven papayas...in a row" summary among six otherwise-generic
  // placeholders) must still restore every figure in that row, not just the
  // one whose caption happened to come back non-generic.
  const rows: Array<{ labels: HTMLElement[]; figures: HTMLElement[] }> = [];
  for (const label of labels) {
    const labelRect = rect(label);
    // Repeated-printed-answer-box targets set bbox left/top/width literally
    // equal to the asset's own bounds, but the *rendered* answer-line height
    // is deliberately shrunk to a single writing-line height (see the
    // answerLines template's own height formula) rather than the full image
    // height - so only left/top/width identify the matching figure; height
    // is expected to differ and must not be part of the match.
    const figure = figures.find((candidate) => {
      if (!hiddenIds.has(candidate.dataset.assetId ?? "")) return false;
      const figureRect = rect(candidate);
      return (
        close(labelRect.left, figureRect.left, 1.5) &&
        close(labelRect.top, figureRect.top, 1.5) &&
        close(labelRect.width, figureRect.width, 1.5)
      );
    });
    if (!figure) continue;
    const row = rows.find((candidate) => close(rect(candidate.labels[0]!).top, labelRect.top, 2.5));
    if (row) {
      row.labels.push(label);
      row.figures.push(figure);
    } else rows.push({ labels: [label], figures: [figure] });
  }
  // A row is only trustworthy once at least one of its own figures has a
  // real, specific caption - otherwise leave it exactly as found rather than
  // guess from nothing but generic placeholders.
  const trustedRows = rows.filter((row) =>
    row.figures.some((figure) => {
      const caption = figure.querySelector("img")?.alt?.trim() ?? "";
      return caption && !placeholderCaption.test(caption);
    }),
  );
  if (!trustedRows.length) return;

  trustedRows.forEach((row, index) => {
    const captions = row.figures.map(
      (figure) => figure.querySelector("img")?.alt?.trim() ?? "",
    );
    // A caption whose own count already covers every figure in the row (e.g.
    // "Seven papayas...in a row" for a 7-image row) is describing the whole
    // row, not just the one icon it happens to be attached to - use it alone
    // rather than also summing the other (generic) figures on top of it.
    const summaryCount = captions
      .map((caption) => countFromCaption(caption))
      .find((count) => count !== undefined && count >= row.figures.length);
    const total =
      summaryCount ??
      captions.reduce((sum, caption) => {
        const isGeneric = !caption || placeholderCaption.test(caption);
        return sum + (isGeneric ? 1 : (countFromCaption(caption) ?? 1));
      }, 0);
    // The hiding rule carries no !important, so an inline override on the
    // element itself always wins the cascade regardless of specificity. Also
    // strip each restored id's own rule out of the stylesheet text, so the
    // validator's hidden-image count (which greps that stylesheet, not
    // computed visibility) doesn't keep counting a now-visible image.
    for (const figure of row.figures) {
      figure.style.setProperty("visibility", "visible");
      const assetId = figure.dataset.assetId ?? "";
      for (const style of document.querySelectorAll("style[data-litera-answer-visual-replacement]"))
        style.textContent = (style.textContent ?? "").replace(
          new RegExp(`figure\\[data-asset-id="${assetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\]\\{visibility:hidden\\}`, "g"),
          "",
        );
    }
    for (const label of row.labels) label.remove();

    const lastFigure = row.figures[row.figures.length - 1]!;
    const anchorRect = rect(lastFigure);
    const roomRight = 98 - (anchorRect.left + anchorRect.width);
    const left = roomRight >= 9 ? anchorRect.left + anchorRect.width + 1 : anchorRect.left;
    const top =
      roomRight >= 9
        ? anchorRect.top
        : Math.min(94, anchorRect.top + anchorRect.height + 0.6);
    const feedbackId = `restored-answer-feedback-${index + 1}`;
    // Number alongside any control already tagged for this page's activity
    // (the same first-bare/rest-suffixed convention used elsewhere, e.g.
    // finalizeMatchingActivities above), so the completeness validator - and
    // anything else looking up data-activity-item - can find this control
    // instead of reporting the activity as having none.
    const baseId = `page-${pageNumber}-activity-0`;
    const existingCount = document.querySelectorAll(`[data-activity-item^="${baseId}"]`).length;
    const groupId = existingCount === 0 ? baseId : `${baseId}-${existingCount + 1}`;
    const control = `<label class="source-answer-line" data-activity-item="${groupId}" data-placement-evidence="restored-repeated-answer-box" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:8%;height:${Math.max(3, anchorRect.height).toFixed(2)}%"><span class="sr-only">Answer</span><input type="text" inputmode="decimal" data-correct-answer="${escapeHtmlAttribute(String(total))}" autocomplete="off" aria-label="Write how many are shown in this row" aria-describedby="${feedbackId}"><span class="answer-feedback" id="${feedbackId}" aria-live="polite"></span></label>`;
    lastFigure.insertAdjacentHTML("afterend", control);
  });
}

/** buildRepeatedAnswerBoxTargets (geometry-storyboard-engine.ts) only ever
 * creates an answer target for the single largest same-dimension asset
 * cluster on the whole page (see restoreMisidentifiedAnswerImages above) - so
 * on a printed "item picture | empty Number column" table with several rows
 * of differently-sized item images (e.g. one row of six merged "avocados"
 * pixels, another of seven individually-sized "papaya" images), every row
 * except the one lucky cluster gets no answer control at all, geometry has
 * no way to know each row's count, and captions aren't ready yet at
 * Storyboard time. Once captions exist, find the table's own printed
 * "Number"/"Namba" column header, group the page's real-content images into
 * rows, and give every row that still has no control of its own a real
 * answer input positioned in that empty column - reusing the exact caption
 * counting already proven for the one row the geometry heuristic did catch. */
function insertImageNumberTableAnswers(document: Document, pageNumber: number) {
  const layoutBlocks = [...document.querySelectorAll<HTMLElement>("[data-layout-block]")];
  const numberHeader = layoutBlocks.find((element) =>
    /^(?:number|namba)$/i.test((element.textContent ?? "").trim()),
  );
  if (!numberHeader) return;

  const rect = (element: Element) => {
    const style = element.getAttribute("style") ?? "";
    const num = (property: string) =>
      Number(
        style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([\\d.]+)%`, "i"))?.[1] ?? NaN,
      );
    return { left: num("left"), top: num("top"), width: num("width"), height: num("height") };
  };
  const close = (a: number, b: number, tolerance: number) =>
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
  const placeholderCaption =
    /^visual used in this section|\b(?:blank|empty)\s+(?:box|space|answer)|writing\s+(?:box|line|rule)|answer\s+box|write-in\s+(?:box|line)/i;

  const numberColumnLeft = rect(numberHeader).left;
  if (!Number.isFinite(numberColumnLeft)) return;

  // Decorative page borders run nearly the full page height; no real table
  // row's own item image does, so a generous height ceiling safely excludes
  // them without needing to name specific asset ids.
  const figures = [...document.querySelectorAll<HTMLElement>("figure[data-asset-id]")].filter(
    (figure) => rect(figure).height < 20,
  );

  const rows: Array<{ figures: HTMLElement[]; top: number }> = [];
  for (const figure of figures) {
    const figureRect = rect(figure);
    if (!Number.isFinite(figureRect.top)) continue;
    const caption = figure.querySelector("img")?.alt?.trim() ?? "";
    if (!caption || placeholderCaption.test(caption)) continue;
    const row = rows.find((candidate) => close(candidate.top, figureRect.top, 2.5));
    if (row) row.figures.push(figure);
    else rows.push({ figures: [figure], top: figureRect.top });
  }
  if (!rows.length) return;

  rows.forEach((row, index) => {
    // A row that already has any answer control near it - the one row
    // restoreMisidentifiedAnswerImages just fixed, or anything else - must
    // not get a second, competing one.
    const existingControl = [
      ...document.querySelectorAll<HTMLElement>(".source-answer-line, [data-activity-item]"),
    ].find((existing) => close(rect(existing).top, row.top, 4));

    const total = row.figures.reduce((sum, figure) => {
      const caption = figure.querySelector("img")?.alt?.trim() ?? "";
      return sum + (countFromCaption(caption) ?? 1);
    }, 0);
    if (existingControl) {
      const input = existingControl.querySelector<HTMLInputElement>(
        "input, select, textarea",
      );
      input?.setAttribute("data-correct-answer", String(total));
      input?.setAttribute(
        "aria-label",
        "Write how many are shown in this row",
      );
      return;
    }
    const rowHeight = Math.max(...row.figures.map((figure) => rect(figure).height));
    const feedbackId = `table-row-answer-feedback-${index + 1}`;
    // Same first-bare/rest-suffixed data-activity-item convention as
    // restoreMisidentifiedAnswerImages above, continuing its own numbering
    // if it already tagged a control for this page's activity, so the
    // completeness validator can find every row's control, not just one.
    const baseId = `page-${pageNumber}-activity-0`;
    const existingCount = document.querySelectorAll(`[data-activity-item^="${baseId}"]`).length;
    const groupId = existingCount === 0 ? baseId : `${baseId}-${existingCount + 1}`;
    const control = `<label class="source-answer-line" data-activity-item="${groupId}" data-placement-evidence="image-number-table" style="left:${numberColumnLeft.toFixed(2)}%;top:${row.top.toFixed(2)}%;width:8%;height:${Math.max(3, rowHeight).toFixed(2)}%"><span class="sr-only">Answer</span><input type="text" inputmode="decimal" data-correct-answer="${escapeHtmlAttribute(String(total))}" autocomplete="off" aria-label="Write how many are shown in this row" aria-describedby="${feedbackId}"><span class="answer-feedback" id="${feedbackId}" aria-live="polite"></span></label>`;
    document.querySelector("main[data-litera-page]")?.insertAdjacentHTML("beforeend", control);
  });
}

function cleanImageCaption(value: string) {
  let caption = value.replace(/\s+/g, " ").trim();
  const visualPrefix = /^(?:an?\s+)?(?:image|illustration|figure|diagram|photo|picture)\s+(?:accompanying|for|of|showing|depicting)\s+/i;
  let removedPrefix = false;
  while (visualPrefix.test(caption)) {
    caption = caption.replace(visualPrefix, "").trim();
    removedPrefix = true;
  }
  if (removedPrefix && caption) caption = `Illustration of ${caption}`;
  return caption || "Meaningful textbook visual.";
}
function buildEasyReadCatalog(
  entries: TextCatalogEntry[],
  level: ReadingLevel = "middle",
) {
  return entries.map((entry) => ({
    ...entry,
    id: `easy-${entry.id}`,
    text: fallbackEasyReadText(entry.text, level),
  }));
}
function fallbackEasyReadText(value: string, level: ReadingLevel) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (level === "late") return clean;
  const sentences = clean.replace(/\s*[;:]\s*/g, ". ");
  if (level === "middle") return sentences;
  return sentences
    .replace(
      /,\s+(and|but|because|na|lakini|kwa sababu)\s+/gi,
      ". $1 ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
function buildGlossary(book: DeviceBook) {
  const counts = new Map<string, number>();
  for (const page of book.structuredPages ?? [])
    for (const word of [
      page.title,
      ...page.sections.map((section) => section.text),
    ]
      .join(" ")
      .match(/[\p{L}]{7,}/gu) ?? [])
      counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([term]) => ({
      term,
      definition: `Review the meaning of “${term}” in the book context.`,
    }));
}
function isTableOfContentsPage(page: StructuredPage) {
  const lines = [page.title, ...page.sections.map((section) => section.text)]
    .flatMap((value) => value.split(/\n+/))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (/\b(table of contents|contents|yaliyomo|faharasa)\b/i.test(lines.slice(0, 8).join(" ")))
    return true;
  const looksLikeExercise = /\b(?:exercise|activity|questions?|zoezi|shughuli|maswali|jibu|andika)\b/i.test(lines.join(" "));
  const leaderOccurrences =
    lines.join(" ").match(/\.{2,}\s*(?:\d{1,4}|[ivxlcdm]+)\b/gi) ?? [];
  return !looksLikeExercise && leaderOccurrences.length >= 3;
}
function buildTableOfContents(book: DeviceBook) {
  const pages = [...(book.structuredPages ?? [])].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );
  const seen = new Set<string>();
  const entries: Array<{ title: string; pageNumber: number; level: number }> =
    [];
  for (const page of pages) {
    if (isTableOfContentsPage(page)) continue;
    const texts = [page.title, ...page.sections.map((section) => section.text)]
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const chapterIndex = texts.findIndex((text) =>
      /^(?:sura(?:\s+ya)?|chapter|unit)\b/i.test(text),
    );
    const frontIndex = texts.findIndex((text) =>
      /^(?:shukrani|utangulizi|dibaji|preface|acknowledg)/i.test(text),
    );
    const headingIndex = chapterIndex >= 0 ? chapterIndex : frontIndex;
    if (headingIndex < 0) continue;
    const pageNumber =
      pages.findIndex((candidate) => candidate.pageNumber === page.pageNumber) +
      1;
    const heading = texts[headingIndex]!;
    const key = heading.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ title: heading, pageNumber, level: 1 });
    }
    if (chapterIndex >= 0) {
      const subtitle = texts
        .slice(chapterIndex + 1)
        .find(
          (text) =>
            text.length <= 100 &&
            !/^\d+$/.test(text) &&
            !/^(?:utangulizi|fikiri|hatua|kazi ya)/i.test(text),
        );
      if (subtitle && !seen.has(subtitle.toLocaleLowerCase())) {
        seen.add(subtitle.toLocaleLowerCase());
        entries.push({ title: subtitle, pageNumber, level: 2 });
      }
    }
  }
  const contentsPageNumbers = new Set(
    pages.filter(isTableOfContentsPage).map((page) => page.pageNumber),
  );
  const extractedContentsText = (book.extractedPages ?? [])
    .filter((page) => {
      const text = page.text?.replace(/\s+/g, " ").trim() ?? "";
      const leaders = text.match(/\.{3,}\s*(?:\d{1,4}|[ivxlcdm]+)\b/gi) ?? [];
      return contentsPageNumbers.has(page.number) || leaders.length >= 3;
    })
    .map((page) => page.text ?? "");
  const printedTitles = [
    ...pages
      .filter((page) => contentsPageNumbers.has(page.pageNumber))
      .flatMap((page) => [page.title, ...page.sections.map((section) => section.text)]),
    ...extractedContentsText,
  ]
    .flatMap(extractPrintedContentsTitles)
    .map((value) =>
      value
        .replace(/\s*\.{2,}\s*(?:\d{1,4}|[ivxlcdm]+)\s*$/i, "")
        .replace(/\s+(?:\d{1,4}|[ivxlcdm]+)\s*$/i, "")
        .replace(
          /^(?:\d+|[ivxlcdm]+)\s+(?=(?:chapter|unit|sura)\b)/i,
          "",
        )
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(
      (value) =>
        value.length >= 4 &&
        !/^(?:table of contents|contents|yaliyomo|faharasa|\.{2,}|\d+|[ivxlcdm]+)$/i.test(value) &&
        !/^(?:chapter|unit|sura(?:\s+ya)?)\b/i.test(value),
    );
  for (const title of printedTitles) {
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) continue;
    const match = bestContentsDestination(title, pages);
    if (!match) continue;
    const digitalPageNumber =
      pages.findIndex((page) => page.pageNumber === match.pageNumber) + 1;
    const existingAtPage = entries.findIndex(
      (entry) =>
        entry.pageNumber === digitalPageNumber &&
        (key.includes(entry.title.toLocaleLowerCase()) ||
          entry.title.toLocaleLowerCase().includes(key)),
    );
    if (existingAtPage >= 0) {
      if (title.length > entries[existingAtPage]!.title.length)
        entries[existingAtPage] = { ...entries[existingAtPage]!, title };
      seen.add(key);
      continue;
    }
    seen.add(key);
    entries.push({
      title,
      pageNumber: digitalPageNumber,
      level: /^(?:sura|chapter|unit)\b/i.test(title) ? 1 : 2,
    });
  }
  // A partial conversion should still expose every chapter that is actually
  // present, even when source TOC extraction split the chapter label from its
  // dotted topic row or a watermark interrupted that row.
  for (const page of pages) {
    if (contentsPageNumbers.has(page.pageNumber)) continue;
    const texts = [page.title, ...page.sections.slice(0, 10).map((section) => section.text)]
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const chapter = texts.find((text) =>
      /^(?:chapter|unit|sura(?:\s+ya)?)\s+[\p{L}\p{N}-]+\b/iu.test(text),
    );
    if (!chapter) continue;
    const digitalPageNumber = pages.findIndex(
      (candidate) => candidate.pageNumber === page.pageNumber,
    ) + 1;
    const chapterKey = chapter.toLocaleLowerCase();
    if (!seen.has(chapterKey)) {
      seen.add(chapterKey);
      entries.push({ title: chapter, pageNumber: digitalPageNumber, level: 1 });
    }
    const subtitle = texts.find(
      (text) =>
        text !== chapter &&
        text.length <= 100 &&
        !/^\d+$/.test(text) &&
        !/\b(?:exercise|activity|zoezi|example)\b/i.test(text),
    );
    if (subtitle && !seen.has(subtitle.toLocaleLowerCase())) {
      seen.add(subtitle.toLocaleLowerCase());
      entries.push({ title: subtitle, pageNumber: digitalPageNumber, level: 2 });
    }
  }
  entries.sort((a, b) => a.pageNumber - b.pageNumber || a.level - b.level);
  return entries;
}

function extractPrintedContentsTitles(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const leaderEntries = [
    ...normalized.matchAll(
      /(?:^|\s)([^.]{3,160}?)\s*\.{2,}\s*(?:\d{1,4}|[ivxlcdm]+)(?=\s|$)/gi,
    ),
  ]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (leaderEntries.length) return leaderEntries;
  return value.split(/\n+/);
}

function bestContentsDestination(title: string, pages: StructuredPage[]) {
  const tokens = semanticTitleTokens(title);
  if (!tokens.length) return undefined;
  const chapterMarker = title.match(
    /^(?:chapter|unit|sura(?:\s+ya)?)\s+([\p{L}\p{N}-]+)/iu,
  )?.[1]?.toLocaleLowerCase();
  let best: { page: StructuredPage; score: number; matches: number } | undefined;
  for (const page of pages) {
    if (isTableOfContentsPage(page)) continue;
    const pageHeadingText = [
      page.title,
      ...page.sections.slice(0, 8).map((section) => section.text),
    ].join(" ");
    if (
      chapterMarker &&
      !new RegExp(
        `\\b(?:chapter|unit|sura(?:\\s+ya)?)\\s+${escapeRegExp(chapterMarker)}\\b`,
        "iu",
      ).test(pageHeadingText)
    )
      continue;
    const pageTokens = new Set(semanticTitleTokens(pageHeadingText));
    const matches = tokens.filter((token) => pageTokens.has(token)).length;
    const score = matches / tokens.length;
    if (!best || score > best.score) best = { page, score, matches };
  }
  const requiredMatches = tokens.length <= 2 ? 1 : Math.ceil(tokens.length * 0.5);
  return best && best.score >= 0.5 && best.matches >= requiredMatches
    ? best.page
    : undefined;
}

function semanticTitleTokens(value: string) {
  const ignored = new Set([
    "the",
    "and",
    "of",
    "ya",
    "na",
    "wa",
    "la",
    "chapter",
    "unit",
    "sura",
    "number",
    "numbers",
  ]);
  return [
    ...new Set(
      (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
        (token) => token.length > 1 && !ignored.has(token),
      ),
    ),
  ];
}

type PageDecoration = {
  top: string;
  bottom: string;
  accent: string;
  bookPalette?: string[];
  gradientStops?: string[];
  gradientAngle?: number;
  suppressTopStrip?: boolean;
};
type GeometryPageOptions = {
  fontFamily?: string;
  sourcePageUrl?: string;
  digitalPageNumber: number;
  decoration: PageDecoration;
  tocEntries?: Array<{ title: string; pageNumber: number; level: number }>;
  tocTitle?: string;
};
type RenderStoryboardSourceInput = {
  book: DeviceBook;
  sourcePage: StructuredPage;
  structuredPages: StructuredPage[];
  tableOfContents: Array<{ title: string; pageNumber: number; level: number }>;
  publicationPalette: string[];
  providerKeys?: ProviderKeys;
  visionProvider?: ProviderId;
  signal?: AbortSignal;
  userInstructions?: string;
};
async function renderStoryboardSourcePage(input: RenderStoryboardSourceInput) {
  const {
    book,
    sourcePage,
    structuredPages,
    tableOfContents,
    publicationPalette,
    providerKeys,
    visionProvider,
    signal,
  } = input;
  signal?.throwIfAborted();
  const digitalPageNumber =
    structuredPages.findIndex(
      (page) => page.pageNumber === sourcePage.pageNumber,
    ) + 1;
  const fontFamily = book.conversionConfig?.fontFamily || undefined;
  const storedPage = book.extractedPages?.find(
    (item) => item.number === sourcePage.pageNumber,
  );
  const extractedPage = storedPage
    ? await storyboardPhase(
        `Restoring page ${sourcePage.pageNumber} layout`,
        () => ensurePageGeometry(book, storedPage),
      )
    : undefined;
  if (!extractedPage)
    throw new Error(
      `Page ${sourcePage.pageNumber} has no extracted source image.`,
    );
  const hasOralInstruction = /\b(?:read|practise|practice)\s+(?:the\s+.+\s+)?aloud\b|\borally\b|\bsoma\s+kwa\s+sauti\b/i.test(
    [
      extractedPage.text ?? "",
      sourcePage.title,
      ...sourcePage.sections.map((section) => section.text),
    ].join(" "),
  );
  const hasInstructionalVisuals =
    (extractedPage.layoutBlocks ?? []).some(
      (block) =>
        block.type === "image" &&
        block.bbox.w >= 5 &&
        block.bbox.h >= 5 &&
        block.bbox.w * block.bbox.h >= 120,
    ) ||
    (extractedPage.assets ?? []).some((asset) =>
      isMeaningfulStoryboardAsset(asset),
    );
  // “Read aloud” can be one activity on an otherwise image-rich page. Treat
  // the page as oral-only only when the source itself has no instructional
  // visuals; otherwise examples such as counting fruit silently disappeared.
  const oralOnlyPage = hasOralInstruction && !hasInstructionalVisuals;
  const thumbnail = await storyboardPhase(
    `Restoring page ${sourcePage.pageNumber} image`,
    () => readablePageImage(book, extractedPage),
  );
  await abortableUiDelay(0, signal);
  const assets = oralOnlyPage
    ? []
    : await storyboardPhase(
        `Restoring page ${sourcePage.pageNumber} visuals`,
        () => ensurePageAssets(book, { ...extractedPage, thumbnail }),
      );
  await abortableUiDelay(0, signal);
  const renderPage = { ...extractedPage, thumbnail, assets };
  const sampledDecoration = oralOnlyPage
    ? {
        top: "#ffffff",
        bottom: "#ffffff",
        accent:
          publicationPalette.find((color) => /^#[0-9a-f]{6}$/i.test(color)) ??
          "#02acaf",
      }
    : await storyboardPhase(
        `Sampling page ${sourcePage.pageNumber} design`,
        () => samplePageDecoration(thumbnail),
      );
  const decoration = harmonizePageDecoration(
    sampledDecoration,
    publicationPalette,
  );
  const styleguide = buildBookStyleguide(fontFamily, decoration);
  const queuedInstructions = (book.correctionPrompts ?? [])
    .filter(
      (item) =>
        (item.status === "queued" || item.status === "next") &&
        (item.scope !== "page" || item.pageNumber === sourcePage.pageNumber),
    )
    .map((item) => item.text);
  const userInstructions = [...queuedInstructions, input.userInstructions]
    .filter(Boolean)
    .join("\n");
  const detectedActivities = detectActivities(
    sourcePage.pageNumber,
    extractedPage.text ?? "",
  );
  const sourceActivities = sourcePage.activities.filter(
    (activity) =>
      !isWorkedExamplePrompt(activity.prompt, extractedPage.text ?? ""),
  );
  const knownActivityPrompts = new Set(
    sourceActivities.map((activity) => normalizeSemanticText(activity.prompt)),
  );
  const effectiveSourcePage = {
    ...sourcePage,
    activities: [
      ...sourceActivities,
      ...detectedActivities.filter(
        (activity) =>
          !knownActivityPrompts.has(normalizeSemanticText(activity.prompt)),
      ),
    ],
  };
  const designInstructions = sourceAwareDesignInstructions(
    effectiveSourcePage,
    extractedPage.text ?? "",
  );
  const contentsPages = structuredPages.filter(isTableOfContentsPage);
  const contentsIndex = contentsPages.findIndex(
    (page) => page.pageNumber === sourcePage.pageNumber,
  );
  const tocEntriesForPage =
    contentsIndex >= 0
      ? tableOfContents.slice(
          Math.floor((contentsIndex * tableOfContents.length) / contentsPages.length),
          Math.floor(((contentsIndex + 1) * tableOfContents.length) / contentsPages.length),
        )
      : undefined;
  const tocTitle = isTableOfContentsPage(sourcePage)
    ? ([
        sourcePage.title,
        ...sourcePage.sections.map((section) => section.text),
      ].find((value) =>
        /^(?:yaliyomo|faharasa|table of contents|contents)$/i.test(
          value.trim(),
        ),
      ) ?? "Table of contents")
    : undefined;
  const geometryOptions = {
    fontFamily,
    digitalPageNumber,
    decoration,
    tocEntries: tocEntriesForPage,
    tocTitle,
  };
  let storyboardPage: StoryboardPage = await storyboardPhase(
    `Rendering page ${sourcePage.pageNumber} as semantic HTML`,
    () =>
      providerKeys && visionProvider && userInstructions.trim()
        ? withProviderRetry(
            () =>
              createAdtStoryboardPage(
                effectiveSourcePage,
                renderPage,
                geometryOptions,
                {
                  keys: providerKeys,
                  provider: visionProvider,
                  styleguide,
                  userInstructions: `${designInstructions}\n${userInstructions}`.trim(),
                  signal,
                  requireAi: true,
                },
              ),
            signal,
          )
        : createGeometryStoryboardPage(
            effectiveSourcePage,
            renderPage,
            geometryOptions,
          ),
  );
  const requiredVisuals = semanticStoryboardAssets(renderPage.assets ?? []);
  const missingVisualIds = missingStoryboardAssetIds(
    storyboardPage.html,
    requiredVisuals,
  );
  if (missingVisualIds.length) {
    signal?.throwIfAborted();
    const faithfulPage = await createGeometryStoryboardPage(
      effectiveSourcePage,
      renderPage,
      geometryOptions,
    );
    storyboardPage = restoreMissingStoryboardVisuals(
      storyboardPage,
      faithfulPage,
      missingVisualIds,
    );
  }
  const savedCaptions = (book.imageCaptions ?? [])
    .filter((caption) => caption.pageNumber === sourcePage.pageNumber)
    .map((caption) => ({
      imageId: caption.imageId,
      caption: caption.caption,
    }));
  return savedCaptions.length
    ? { ...applyImageCaptions(storyboardPage, savedCaptions), digitalPageNumber }
    : { ...storyboardPage, digitalPageNumber };
}

function restoreMissingStoryboardVisuals(
  rendered: StoryboardPage,
  faithful: StoryboardPage,
  missingIds: string[],
) {
  const missing = new Set(missingIds);
  const output = new DOMParser().parseFromString(rendered.html, "text/html");
  const source = new DOMParser().parseFromString(faithful.html, "text/html");
  const outputMain = output.querySelector("main[data-litera-page]");
  if (!outputMain) return faithful;
  for (const id of missing) {
    const escaped = CSS.escape(id);
    const sourceVisual = source.querySelector<HTMLElement>(
      `[data-asset-id="${escaped}"]`,
    );
    if (sourceVisual) outputMain.append(sourceVisual.cloneNode(true));
  }
  const restoredBlocks = faithful.blocks.filter(
    (block) => block.assetId && missing.has(block.assetId),
  );
  return {
    ...rendered,
    html: `<!doctype html>${output.documentElement.outerHTML}`,
    blocks: [
      ...rendered.blocks.filter(
        (block) => !block.assetId || !missing.has(block.assetId),
      ),
      ...restoredBlocks,
    ].sort((a, b) => a.order - b.order),
  };
}

function isWorkedExamplePrompt(prompt: string, sourceText: string) {
  const normalizedSource =
    normalizeSemanticText(sourceText).toLocaleLowerCase();
  const normalizedPrompt = normalizeSemanticText(prompt).toLocaleLowerCase();
  const promptIndex = normalizedSource.indexOf(normalizedPrompt);
  if (promptIndex < 0) return false;
  const before = normalizedSource.slice(0, promptIndex);
  const exampleIndex = Math.max(
    before.lastIndexOf("example"),
    before.lastIndexOf("mfano"),
  );
  if (exampleIndex < 0) return false;
  const boundaryAfterExample = before
    .slice(exampleIndex)
    .match(/\b(?:activity|exercise|practice|zoezi|shughuli|maswali)\b/i);
  return !boundaryAfterExample;
}

function sourceAwareDesignInstructions(
  page: StructuredPage,
  sourceText: string,
) {
  const text = sourceText.replace(/\s+/g, " ");
  const hints = [
    "Use responsive semantic sections; never lay PDF text lines out as one long absolute-positioned column.",
    "Keep printed examples visually separate from learner activities and never add response controls to worked examples.",
  ];
  if (
    /\b(?:mfano|example)\b/i.test(text) &&
    /\b(?:zoezi|exercise|activity)\b/i.test(text)
  )
    hints.push(
      "Preserve the worked example as its own bordered visual/diagram card, then render the exercise in a distinct warm-coloured activity panel with a clear opaque header band.",
    );
  if (/\bjedwali|\btable\b/i.test(text))
    hints.push(
      "Reconstruct the ruled grid as a semantic table. Keep numbered question groups separate, with each non-blank short-answer input directly below its subquestion.",
    );
  if (/\b(?:chora|draw)\b.*\b(?:saa|clock)\b/i.test(text))
    hints.push(
      "Render each clock task as a responsive card with an accessible SVG clock face and a time control; do not substitute a generic text blank.",
    );
  if (/\b(?:oanisha|linganisha|matching|orodha a|orodha b)\b/i.test(text))
    hints.push(
      "Render matching content as two clearly related lists with keyboard-accessible select controls or equivalent labelled matching inputs.",
    );
  if (page.activities.some((activity) => activity.type === "fill-blank"))
    hints.push(
      "Replace each printed dash run with one compact inline input at that exact sentence position. Do not put all inputs in a separate block.",
    );
  return hints.join("\n");
}

async function rerenderPageFromAssistant(
  book: DeviceBook,
  pageNumber: number,
  instruction: string | undefined,
  promptId: string,
  providerKeys?: ProviderKeys,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const structuredPages = uniqueStoryboardSources(book.structuredPages);
  const sourcePage = structuredPages.find(
    (page) => page.pageNumber === pageNumber,
  );
  if (!sourcePage)
    throw new Error(
      `Page ${pageNumber} has no saved semantic structure. Run Structure first.`,
    );
  if (!book.extractedPages?.some((page) => page.number === pageNumber))
    throw new Error(`Page ${pageNumber} has no extracted source context.`);
  const tableOfContents = buildTableOfContents({ ...book, structuredPages });
  const publicationPalette = await derivePublicationPalette(
    book,
    structuredPages,
    signal,
  );
  let storyboardPage;
  try {
    storyboardPage = await renderStoryboardSourcePage({
      book,
      sourcePage,
      structuredPages,
      tableOfContents,
      publicationPalette,
      providerKeys: instruction ? providerKeys : undefined,
      visionProvider:
        instruction && providerKeys ? selectVisionProvider(providerKeys) : undefined,
      userInstructions: instruction,
      signal,
    });
  } catch (error) {
    if (!instruction || isAbortError(error)) throw error;
    storyboardPage = await renderStoryboardSourcePage({
      book,
      sourcePage,
      structuredPages,
      tableOfContents,
      publicationPalette,
      signal,
    });
    toast.warning(
      `The instructed AI render was unavailable. Page ${pageNumber} was rebuilt faithfully with the local engine instead.`,
    );
  }
  const previousPage = book.storyboardPages?.find(
    (page) => page.pageNumber === pageNumber,
  );
  if (
    previousPage?.html === storyboardPage.html &&
    instruction &&
    providerKeys &&
    storyboardPage.renderSource === "ai"
  ) {
    storyboardPage = await renderStoryboardSourcePage({
      book,
      sourcePage,
      structuredPages,
      tableOfContents,
      publicationPalette,
      providerKeys,
      visionProvider: selectVisionProvider(providerKeys),
      userInstructions: `${instruction}\n\nThe previous attempt returned unchanged HTML. Make the requested visible and semantic changes while preserving source fidelity.`,
      signal,
    });
  }
  // A safe geometry fallback can be byte-for-byte identical even though the
  // page was successfully rebuilt (notably for TOC and source-faithful pages).
  // Do not turn that valid fallback into a failed rerender; persist the fresh
  // page timestamp and revision so the operation remains resumable.
  const storyboardPages = [
    ...(book.storyboardPages ?? []).filter(
      (page) => page.pageNumber !== pageNumber,
    ),
    storyboardPage,
  ].sort((a, b) => a.pageNumber - b.pageNumber);
  // A page repair must remain page-scoped. Recompiling CSS from every page
  // made a one-page rerender scale with the entire book and could lock up the
  // UI. AI and local pages already contain their required page styles.
  const storyboardCss = book.storyboardCss;
  const next = {
    ...book,
    storyboardPages,
    storyboardCss,
    // Page-specific rerenders can change a TOC continuation or introduce a
    // newly detected chapter. Keep the reader drawer in sync with the same
    // authoritative contents used to rebuild the page.
    tableOfContents,
    correctionPrompts: (book.correctionPrompts ?? []).filter(
      (prompt) => prompt.id !== promptId,
    ),
    stageProgress: {
      ...book.stageProgress,
      storyboard: Math.round(
        (storyboardPages.length / Math.max(1, structuredPages.length)) * 100,
      ),
    },
  };
  return {
    ...next,
    sourceTextCatalog: buildTextCatalog(next),
    imageCaptions: buildImageCaptions(next),
  };
}

async function withProviderRetry<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
  }
  throw lastError;
}

async function processWithBoundedConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
) {
  const executing = new Set<Promise<void>>();
  let launched = 0;
  try {
    for (const item of items) {
      signal?.throwIfAborted();
      if (launched > 0 && launched < concurrency)
        await abortableUiDelay(100, signal);
      const task = worker(item).finally(() => executing.delete(task));
      executing.add(task);
      launched += 1;
      if (executing.size >= concurrency) await Promise.race(executing);
    }
    await Promise.all(executing);
  } catch (error) {
    await Promise.allSettled(executing);
    throw error;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        signal?.throwIfAborted();
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}
function abortableUiDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted)
      return reject(signal.reason ?? new DOMException("Stopped", "AbortError"));
    const timer = window.setTimeout(done, milliseconds);
    signal?.addEventListener("abort", aborted, { once: true });
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      window.clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Stopped", "AbortError"));
    }
  });
}
async function createGeometryStoryboardPage(
  sourcePage: StructuredPage,
  extractedPage: NonNullable<DeviceBook["extractedPages"]>[number],
  options: GeometryPageOptions,
) {
  const semanticAssets = semanticStoryboardAssets(extractedPage.assets ?? []);
  const base = createStoryboardPage(
    sourcePage,
    { ...extractedPage, assets: semanticAssets },
    options.fontFamily,
  );
  const assetUrls = Object.fromEntries(
    await Promise.all(
      semanticAssets.map(
        async (asset) =>
          [asset.id, await persistentImageUrl(asset.blob)] as const,
      ),
    ),
  );
  const html = createGeometryStoryboardHtml(
    {
      number: extractedPage.number,
      width: extractedPage.width,
      height: extractedPage.height,
      text: extractedPage.text,
      layoutBlocks: extractedPage.layoutBlocks,
      assets: semanticAssets,
    },
    assetUrls,
    {
      fontFamily: options.fontFamily,
      digitalPageNumber: options.digitalPageNumber,
      decoration: options.decoration,
      tocEntries: options.tocEntries,
      tocTitle: options.tocTitle,
      activityPrompts: sourcePage.activities.map((activity) => activity.prompt),
    },
  );
  return {
    ...base,
    html: reinforceTablesAndActivities(
      html,
      sourcePage.activities,
      options.decoration.accent,
    ),
    renderSource: "local" as const,
    renderProvider: "litera-semantic-layout",
    renderModel: "source-geometry",
  };
}

function semanticStoryboardAssets(allAssets: ExtractedPageAsset[]) {
  const composedExamples = allAssets.filter(
    (asset) =>
      asset.id.includes("composite-example") ||
      asset.id.includes("composite-activity-diagram"),
  );
  return deduplicateStoryboardAssets(
    allAssets.filter((asset) => {
      if (!isMeaningfulStoryboardAsset(asset)) return false;
      if (
        asset.id.includes("composite-example") ||
        asset.id.includes("composite-activity-diagram")
      )
        return true;
      const centerX = asset.bounds.x + asset.bounds.w / 2;
      const centerY = asset.bounds.y + asset.bounds.h / 2;
      // A composed example is the authoritative visual for that printed region.
      // Supplying its nested PDF paint fragments as separate images causes the
      // model to stretch decorative slivers into full-width illustrations.
      return !composedExamples.some(
        (composite) =>
          centerX >= composite.bounds.x &&
          centerX <= composite.bounds.x + composite.bounds.w &&
          centerY >= composite.bounds.y &&
          centerY <= composite.bounds.y + composite.bounds.h,
      );
    }),
  );
}

function isMeaningfulStoryboardAsset(asset: ExtractedPageAsset) {
  if (
    asset.containsText &&
    !asset.id.includes("composite-example") &&
    !asset.id.includes("composite-activity-diagram")
  )
    return false;
  const { w, h } = asset.bounds;
  // Counting and matching activities often use intentionally small repeated
  // objects (fruit, counters, shapes). They are instructional content, not
  // decoration, and must survive Storyboard even when each instance occupies
  // only a few hundred source pixels.
  if (w < 5 || h < 5 || w * h < 120) return false;
  const ratio = w / Math.max(1, h);
  return ratio >= 0.03 && ratio <= 30;
}

function isDecorativePageAsset(
  asset: ExtractedPageAsset,
  pageWidth: number,
  pageHeight: number,
) {
  const { x, y, w, h } = asset.bounds;
  const edgeStrip =
    (x <= pageWidth * 0.045 || x + w >= pageWidth * 0.955) &&
    ((w <= pageWidth * 0.16 && h >= pageHeight * 0.35) ||
      (w <= pageWidth * 0.25 && h >= pageHeight * 0.7));
  const trimFurniture =
    (y <= pageHeight * 0.05 || y + h >= pageHeight * 0.95) &&
    h <= pageHeight * 0.13 &&
    w >= pageWidth * 0.18;
  const folioBadge =
    y >= pageHeight * 0.88 && w <= pageWidth * 0.25 && h <= pageHeight * 0.1;
  const cornerFurniture =
    (x <= pageWidth * 0.08 || x + w >= pageWidth * 0.92) &&
    (y <= pageHeight * 0.08 || y + h >= pageHeight * 0.92) &&
    w <= pageWidth * 0.15 &&
    h <= pageHeight * 0.15;
  return edgeStrip || trimFurniture || folioBadge || cornerFurniture;
}

function deduplicateStoryboardAssets(assets: ExtractedPageAsset[]) {
  const kept: ExtractedPageAsset[] = [];
  for (const asset of [...assets].sort(
    (a, b) => b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h,
  )) {
    const duplicate = kept.some((candidate) => {
      const width = Math.max(
        0,
        Math.min(
          candidate.bounds.x + candidate.bounds.w,
          asset.bounds.x + asset.bounds.w,
        ) - Math.max(candidate.bounds.x, asset.bounds.x),
      );
      const height = Math.max(
        0,
        Math.min(
          candidate.bounds.y + candidate.bounds.h,
          asset.bounds.y + asset.bounds.h,
        ) - Math.max(candidate.bounds.y, asset.bounds.y),
      );
      const smaller = Math.min(
        candidate.bounds.w * candidate.bounds.h,
        asset.bounds.w * asset.bounds.h,
      );
      return (width * height) / Math.max(1, smaller) > 0.45;
    });
    if (!duplicate) kept.push(asset);
  }
  return kept.sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );
}

type AdtStoryboardOptions = {
  keys: ProviderKeys;
  provider: ProviderId;
  styleguide: string;
  userInstructions?: string;
  signal?: AbortSignal;
  requireAi?: boolean;
};
async function createAdtStoryboardPage(
  sourcePage: StructuredPage,
  extractedPage: NonNullable<DeviceBook["extractedPages"]>[number] & {
    thumbnail: Blob;
  },
  options: GeometryPageOptions,
  ai: AdtStoryboardOptions,
) {
  // The TOC is deliberately rendered after all other pages and uses final
  // digital folios. Keep that deterministic rather than asking a model to
  // reproduce obsolete printed page numbers from the source screenshot.
  if (options.tocEntries)
    return createGeometryStoryboardPage(sourcePage, extractedPage, options);
  // Litera keeps a complete printed diagram as one source-faithful visual and
  // adds hidden semantic text around it. Asking a model to redesign that
  // already-composed region introduces avoidable spacing and colour drift.
  if (
    extractedPage.assets?.some(
      (asset) =>
        asset.id.includes("composite-example") ||
        asset.id.includes("composite-activity-diagram"),
    ) &&
    /\b(?:mfano|zoezi)\b/i.test(extractedPage.text ?? "")
  )
    return createGeometryStoryboardPage(sourcePage, extractedPage, options);
  // Do not offer the model tiny PDF paint fragments as reusable artwork.
  // Models tend to stretch these slivers to full width, which distorts the
  // page even when a complete composed illustration is also available.
  const sourceAssets = extractedPage.assets ?? [];
  const sourceComposedExamples = sourceAssets.filter(
    (asset) =>
      asset.id.includes("composite-example") ||
      asset.id.includes("composite-activity-diagram"),
  );
  const semanticAssets = sourceAssets.filter((asset) => {
    if (!isMeaningfulStoryboardAsset(asset)) return false;
    if (
      asset.id.includes("composite-example") ||
      asset.id.includes("composite-activity-diagram")
    )
      return true;
    const centerX = asset.bounds.x + asset.bounds.w / 2;
    const centerY = asset.bounds.y + asset.bounds.h / 2;
    return !sourceComposedExamples.some(
      (composite) =>
        centerX >= composite.bounds.x &&
        centerX <= composite.bounds.x + composite.bounds.w &&
        centerY >= composite.bounds.y &&
        centerY <= composite.bounds.y + composite.bounds.h,
    );
  });
  const semanticPage = { ...extractedPage, assets: semanticAssets };
  const base = createStoryboardPage(
    sourcePage,
    semanticPage,
    options.fontFamily,
  );
  const contentTree = storyboardContentTree(sourcePage);
  try {
    const rendered = await renderPageWithAi({
      image: extractedPage.thumbnail,
      assets: semanticAssets,
      layoutBlocks: extractedPage.layoutBlocks ?? [],
      contentTree,
      styleguide: ai.styleguide,
      userInstructions: ai.userInstructions,
      keys: ai.keys,
      provider: ai.provider,
      fontFamily: options.fontFamily,
      sourceText: extractedPage.text,
      sourceWidth: extractedPage.width,
      sourceHeight: extractedPage.height,
      signal: ai.signal,
    });
    ai.signal?.throwIfAborted();
    if (!storyboardSemanticTreePasses(rendered.html, contentTree))
      throw new Error("AI output changed or omitted semantic content.");
    const assetUrls = Object.fromEntries(
      await Promise.all(
        semanticAssets.map(
          async (asset) =>
            [asset.id, await persistentImageUrl(asset.blob)] as const,
        ),
      ),
    );
    const hydrated = hydrateStoryboardAssets(rendered.html, assetUrls);
    if (
      !storyboardHtmlPassesFidelityGate(
        hydrated,
        extractedPage,
        contentTree.length,
        options.decoration,
      )
    )
      throw new Error("AI output did not meet Litera's source-fidelity gate.");
    const contrastSafe = reinforceLightTextSurfaces(
      hydrated,
      options.decoration.accent,
    );
    const interactive = reinforceTablesAndActivities(
      contrastSafe,
      sourcePage.activities,
      options.decoration.accent,
    );
    return {
      ...base,
      html: ensureVisibleDigitalFolio(
        interactive,
        options.digitalPageNumber,
      ),
      renderSource: "ai" as const,
      renderProvider: rendered.provider,
      renderModel: rendered.model,
      renderFingerprint: rendered.fingerprint,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (ai.requireAi) throw error;
    // Never persist a partially valid model response. The geometry renderer is
    // the safe semantic fallback and also makes provider outages resumable.
    return createGeometryStoryboardPage(sourcePage, extractedPage, options);
  }
}

function ensureVisibleDigitalFolio(html: string, pageNumber: number) {
  if (/class=["'][^"']*source-folio|data-litera-folio/i.test(html)) return html;
  const side = pageNumber % 2 === 0 ? "left:5%" : "right:5%";
  const folio = `<span data-litera-folio aria-label="Digital page ${pageNumber}" style="position:absolute;z-index:30;${side};bottom:2.2%;min-width:2em;color:#303030;font:600 clamp(.7rem,1.2cqw,1rem)/1 Arial,sans-serif;text-align:center">${pageNumber}</span>`;
  return html.replace(/<\/main>/i, `${folio}</main>`);
}

function reinforceLightTextSurfaces(html: string, accent: string) {
  const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#176b3a";
  const guard = `<style id="litera-contrast-guard">main[data-litera-page] [class*="text-white"],main[data-litera-page] [class*="text-gray-50"],main[data-litera-page] [class*="text-slate-50"],main[data-litera-page] [class*="text-neutral-50"]{opacity:1!important;text-shadow:0 1px 2px color-mix(in srgb,${safeAccent} 82%,#000)}</style>`;
  return html.replace(/<\/head>/i, `${guard}</head>`);
}

function reinforceTablesAndActivities(
  html: string,
  activities: StructuredPage["activities"],
  accent: string,
) {
  const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#176b3a";
  const css = `<style id="litera-semantic-controls">main[data-litera-page] table{border-collapse:collapse!important;border:1.5px solid ${safeAccent}!important}main[data-litera-page] th,main[data-litera-page] td{border:1px solid color-mix(in srgb,${safeAccent} 55%,#6b7280)!important;padding:.35em .5em!important}main[data-litera-page] th{background:color-mix(in srgb,${safeAccent} 14%,#fff)!important;font-weight:700}.litera-response{display:flex;max-width:min(100%,34rem);align-items:center;gap:.55em;margin:.55em 0 1.1em}.litera-response-set{display:grid;grid-template-columns:repeat(var(--answer-count,1),minmax(4.5rem,1fr));gap:.75em;max-width:min(100%,34rem);margin:.65em 0 1.1em;padding:0;border:0}.litera-response-set .litera-response{min-width:0;margin:0}.litera-inline-answer{position:relative;display:inline-flex;min-width:4.5em;max-width:9em;margin:0 .18em;vertical-align:baseline}.litera-inline-answer input{box-sizing:border-box;width:100%;height:1.75em;border:0;border-bottom:2px solid color-mix(in srgb,${safeAccent} 70%,#4b5563);border-radius:.2em .2em 0 0;background:color-mix(in srgb,${safeAccent} 5%,#fff);color:#171717;padding:.1em .35em;font:inherit;text-align:center}.litera-inline-answer input:focus{border-bottom-color:${safeAccent};outline:.18em solid color-mix(in srgb,${safeAccent} 20%,transparent);outline-offset:.08em}.litera-inline-answer .litera-answer-feedback{position:absolute;top:100%;left:0;z-index:2;min-width:max-content}.litera-response--stack{display:grid;max-width:100%}.litera-response input[type="text"],.litera-response textarea,.litera-response select{box-sizing:border-box;width:100%;min-height:2.65em;border:2px solid color-mix(in srgb,${safeAccent} 58%,#6b7280);border-radius:.4em;background:#fff;color:#171717;padding:.45em .65em;font:inherit}.litera-response input[inputmode="numeric"],.litera-response input[inputmode="decimal"]{max-width:18rem;text-align:center;font-weight:600}.litera-response input:focus,.litera-response textarea:focus,.litera-response select:focus{border-color:${safeAccent};outline:.22em solid color-mix(in srgb,${safeAccent} 22%,transparent);outline-offset:.08em}.litera-response input[data-answer-state="correct"],.litera-inline-answer input[data-answer-state="correct"]{border-color:#16803c;background:#effcf3}.litera-response input[data-answer-state="incorrect"],.litera-inline-answer input[data-answer-state="incorrect"]{border-color:#b42318;background:#fff3f1}.litera-response textarea{min-height:6.5em;resize:vertical;line-height:1.6}.litera-choice{display:flex;min-height:2.75em;align-items:center;gap:.55em;padding:.35em .5em;border-radius:.4em}.litera-choice:focus-within{background:color-mix(in srgb,${safeAccent} 9%,#fff)}.litera-choice input{accent-color:${safeAccent};width:1.15em;height:1.15em}.litera-answer-feedback{font-size:.82em;font-weight:700}.litera-answer-feedback[data-state="correct"]{color:#126b34}.litera-answer-feedback[data-state="incorrect"]{color:#9f1c14}.litera-answer-toast{position:fixed;z-index:30;left:50%;bottom:1.2rem;max-width:min(90%,26rem);transform:translateX(-50%);padding:.65rem 1rem;border-radius:999px;background:#202124;color:#fff;font:700 .9rem/1.3 system-ui;box-shadow:0 .4rem 1.2rem rgba(0,0,0,.28)}.litera-answer-toast[data-state="correct"]{background:#126b34}.litera-answer-toast[data-state="incorrect"]{background:#9f1c14}.litera-response-group{position:absolute;z-index:6;box-sizing:border-box}.litera-response-group .litera-response{margin:0}.litera-question-answer{position:absolute;right:2.3%;z-index:8;width:2.35cqw;min-width:1.25rem;color:#171717}.litera-question-answer summary{display:grid;box-sizing:border-box;width:2.35cqw;height:2.35cqw;min-width:1.25rem;min-height:1.25rem;cursor:pointer;place-items:center;border:.12cqw solid ${safeAccent};border-radius:999px;background:#fff;color:${safeAccent};font:700 1.15cqw/1 system-ui;list-style:none;box-shadow:0 .12cqw .3cqw rgba(0,0,0,.16)}.litera-question-answer summary::-webkit-details-marker{display:none}.litera-question-answer[open]{width:min(42%,18rem);padding:.6cqw;border:.12cqw solid ${safeAccent};border-radius:.55cqw;background:#fff;box-shadow:0 .5cqw 1.2cqw rgba(0,0,0,.2)}.litera-question-answer[open] summary{margin-left:auto}.litera-question-answer .litera-response{display:grid;margin:.45cqw 0 0;max-width:none}.litera-question-answer .litera-response input{min-height:2.2cqw}@media(max-width:520px){.litera-response-set{grid-template-columns:repeat(2,minmax(4.5rem,1fr))}.litera-question-answer[open]{width:72%}}</style>`;
  const interactionCss = `<style id="litera-activity-games">.litera-response--inline-choice{display:flex;flex-wrap:wrap;gap:.35em .8em;padding:.35em .5em;border:.1cqw solid color-mix(in srgb,${safeAccent} 38%,#fff);border-radius:.45em;background:rgba(255,255,255,.96)}.litera-response--inline-choice legend{float:left;margin-right:.6em;font-weight:700}.litera-response--inline-choice .litera-choice{display:inline-flex;min-height:1.8em;padding:.1em .35em}.litera-has-activity-extension{aspect-ratio:auto!important;overflow:visible!important;padding-bottom:5cqw}.litera-activity-extension{position:relative;z-index:15;left:5%;width:90%;box-sizing:border-box;padding:2cqw 2.5cqw 3cqw;border-top:.12cqw solid color-mix(in srgb,${safeAccent} 45%,#fff);background:#fff}.litera-matching-game{position:relative;width:100%;box-sizing:border-box;padding:1.2cqw;border:.12cqw solid ${safeAccent};border-radius:.8cqw;background:#fff}.litera-matching-game h3{margin:0 0 1cqw;color:${safeAccent};font:700 2cqw/1.2 system-ui}.litera-matching-board{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1cqw}.litera-match-bank,.litera-match-targets{display:grid;gap:.7cqw}.litera-match-card,.litera-match-target{box-sizing:border-box;min-height:4.2cqw;padding:.7cqw 1cqw;border:.1cqw solid color-mix(in srgb,${safeAccent} 58%,#777);border-radius:.55cqw;background:color-mix(in srgb,${safeAccent} 7%,#fff);color:#171717;font:650 1.45cqw/1.25 system-ui;text-align:left}.litera-match-card{cursor:grab}.litera-match-card[aria-pressed="true"]{outline:.28cqw solid color-mix(in srgb,${safeAccent} 28%,transparent)}.litera-match-target{display:flex;align-items:center;justify-content:space-between;gap:.7cqw;cursor:pointer}.litera-match-target[data-answer-state="correct"]{border-color:#16803c;background:#effcf3}.litera-match-target[data-answer-state="incorrect"]{border-color:#b42318;background:#fff3f1}.litera-match-slot{min-width:35%;font-weight:500;color:#5f6368}.litera-matching-grid{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:.4em;align-items:center;margin-top:.5em}.litera-match-left{font-weight:700}.litera-match-arrow{text-align:center;color:${safeAccent}}.litera-matching-grid select{min-width:0;width:100%;padding:.35em;border:.1cqw solid color-mix(in srgb,${safeAccent} 55%,#777);border-radius:.35em;background:#fff}@media(max-width:520px){.litera-matching-board,.litera-matching-grid{grid-template-columns:minmax(0,1fr)}.litera-match-arrow{display:none}}</style>`;
  const fidelityCss = `<style id="litera-source-fidelity">.litera-source-word-card{display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:.15em .45em!important;border:.08cqw solid color-mix(in srgb,${safeAccent} 20%,#b7d8d6)!important;border-radius:.05cqw!important;background:color-mix(in srgb,${safeAccent} 12%,#fff)!important;box-shadow:.14cqw .19cqw .2cqw rgba(0,0,0,.3)!important;font-weight:600!important}.litera-submit-answers,.litera-submit-all{min-width:22%!important;min-height:3.4cqw!important;padding:.9cqw 1.8cqw!important;font-size:1.4cqw!important;box-shadow:0 .2cqw .55cqw rgba(0,0,0,.22)!important}.litera-activity-launchers{position:relative;z-index:25;left:5%;width:90%;box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;gap:.75cqw;flex-wrap:wrap;padding:1.4cqw 0 3cqw;background:#fff}.litera-activity-launchers>span{margin-right:auto;color:#404040;font:650 1.35cqw/1.2 system-ui}.litera-play-activity{box-sizing:border-box;min-height:3.3cqw;padding:.7cqw 1.25cqw;border:.1cqw solid ${safeAccent};border-radius:999px;background:${safeAccent};color:#fff;font:700 1.25cqw/1 system-ui;cursor:pointer}.litera-play-activity[aria-pressed="true"]{background:#fff;color:${safeAccent}}main:not(.litera-activity-playing) .illustration-choice-surface,main:not(.litera-activity-playing) .litera-response-group,main:not(.litera-activity-playing) .litera-submit-answers,main:not(.litera-activity-playing) .litera-submit-all,main:not(.litera-activity-playing) [data-litera-trace-controls],main:not(.litera-activity-playing) .litera-matching-game{visibility:hidden!important;pointer-events:none!important}main:not(.litera-activity-playing) .source-answer-line input{opacity:0!important;pointer-events:none!important}main.litera-activity-playing .illustration-choice-surface,main.litera-activity-playing .source-answer-line input{transition:opacity .18s ease,box-shadow .18s ease}@media(max-width:520px){.litera-activity-launchers{align-items:stretch;flex-direction:column}.litera-activity-launchers>span{margin-right:0}.litera-play-activity{width:100%;font-size:2.7cqw}}</style>`;
  const structuralOverrides = `<style id="litera-structural-overrides">
main[data-litera-page] table{box-sizing:border-box!important;border-collapse:collapse!important;overflow:hidden!important}
main[data-litera-page] tr{box-sizing:border-box!important}
main[data-litera-page] th,main[data-litera-page] td{box-sizing:border-box!important;padding:.45em .65em!important;vertical-align:middle!important}
main[data-litera-page] th,main[data-litera-page] .source-data-table td{font-family:'Arial Black',Arial,'Helvetica Neue',sans-serif!important;font-size:max(2cqw,1.05rem)!important;font-weight:900!important;font-stretch:normal!important;line-height:1!important}
[data-litera-numeric-column="true"]{display:flex!important;align-items:center!important;justify-content:center!important;transform:none!important;text-align:center!important;font-size:var(--litera-column-font-size)!important;width:var(--litera-column-width)!important;font-weight:700!important;line-height:1!important}
[data-litera-cell-centered="true"]{display:flex!important;align-items:center!important;box-sizing:border-box!important;height:var(--litera-cell-height)!important;min-height:0!important;transform:none!important}
[data-litera-cell-centered="figure"]{justify-content:flex-start!important;overflow:hidden!important}
[data-litera-cell-centered="figure"] img{width:100%!important;height:100%!important;object-fit:contain!important;object-position:left center!important}
.activity-panel[data-litera-table-outline="true"]:after{content:"";position:absolute;z-index:20;inset:-.08cqw;box-sizing:border-box;pointer-events:none;border:.22cqw solid var(--litera-outline-color)!important;border-radius:inherit!important}
.source-figure-table-outline{position:absolute;z-index:40;box-sizing:border-box;pointer-events:none;background:transparent;border:.22cqw solid var(--litera-outline-color)!important;border-radius:1.8cqw}
.source-table-column-divider{position:absolute;z-index:39;box-sizing:border-box;pointer-events:none;width:0;border-left:.14cqw solid var(--litera-outline-color)!important}
.source-image-count-table{border-radius:1.35cqw!important;overflow:hidden!important;font-family:'Sassoon Primary','SassoonPrimary','Comic Sans MS','Andika',cursive!important}.source-image-count-table th,.source-image-count-table td{height:50%!important;padding:.35cqw!important;text-align:center!important;vertical-align:middle!important;font-family:inherit!important}.source-image-count-table th{font-size:2.2cqw!important;font-weight:700!important}.source-image-count-table td>img{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important}.source-image-count-table input{box-sizing:border-box;width:82%;height:58%;border:0;border-bottom:.12cqw solid #555;background:transparent;color:#171717;text-align:center;font:inherit!important;font-size:2cqw!important;font-weight:700!important;line-height:1!important;outline:none}
.source-image-count-table th,.source-image-count-table td{border:0!important;border-right:.12cqw solid var(--source-table-accent)!important;border-bottom:.12cqw solid var(--source-table-accent)!important}.source-image-count-table tr>*:last-child{border-right:0!important}.source-image-count-table tr:last-child>*{border-bottom:0!important}
.source-image-count-table .source-image-count-group{position:relative;padding:0!important;overflow:hidden;background:#fff}.source-image-count-table .source-image-count-group>img{position:absolute!important;z-index:1;inset:0;width:100%!important;height:100%!important;max-width:none!important;object-fit:fill!important}
.source-image-count-slice{position:relative;display:block;width:100%;height:100%;overflow:hidden;background:#fff}.source-image-count-slice>img{display:block!important}
.litera-response input[inputmode="numeric"],.litera-response input[inputmode="decimal"],.litera-activity-page input[inputmode="numeric"],.litera-activity-page input[inputmode="decimal"]{font-family:Arial,'Helvetica Neue',sans-serif!important;font-size:clamp(1rem,2cqw,1.5rem)!important;font-weight:800!important;line-height:1!important}
.litera-question-answer{display:none!important}
body:has(.litera-activity-launchers){display:flex!important;flex-direction:column!important;align-items:stretch!important}
.litera-activity-launchers{position:relative!important;inset:auto!important;order:2;width:100%!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;padding:.8rem 5%!important;border-top:1px solid #ddd!important;border-radius:0!important;background:#fff!important}
.litera-activity-launchers>span{display:none!important}
body.litera-hide-activity-bars .litera-activity-launchers{display:none!important}
.litera-activity-page{position:fixed;z-index:100;inset:0;box-sizing:border-box;display:none;overflow:auto;background:#fff;padding:clamp(1rem,3cqw,2.5rem)}
body.litera-activity-open .litera-activity-page{display:block}
body.litera-activity-open>main[data-litera-page]{visibility:hidden}
.litera-activity-page__header{position:sticky;z-index:4;top:0;display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:-1rem -1rem 1rem;padding:1rem;background:#fff;border-bottom:1px solid #d4d4d4}
.litera-activity-page__heading{display:grid;gap:.2rem}.litera-activity-page__title{margin:0;color:${safeAccent};font:800 clamp(1.2rem,3cqw,2rem)/1.2 system-ui;text-transform:uppercase;letter-spacing:.025em}.litera-activity-page__reference{margin:0;color:#666;font:650 clamp(.78rem,1.35cqw,.95rem)/1.2 system-ui}
.litera-close-activity{padding:.65rem 1rem;border:1px solid ${safeAccent};border-radius:999px;background:#fff;color:${safeAccent};font:700 1rem/1 system-ui;cursor:pointer}
.litera-activity-page__content{display:grid;gap:1rem;max-width:70rem;margin:auto}
.litera-activity-source{position:relative;width:100%;box-sizing:border-box;overflow:hidden;border:1px solid color-mix(in srgb,${safeAccent} 35%,#ddd);border-radius:1rem;background:#fff}.litera-activity-source>[data-layout-block],.litera-activity-source>figure,.litera-activity-source>.source-rule,.litera-activity-source>.activity-grid-cell,.litera-activity-source>.source-answer-line{position:absolute!important;margin:0!important;box-sizing:border-box!important}.litera-activity-source .source-answer-line input{opacity:1!important;pointer-events:auto!important}.litera-activity-source .source-folio,.litera-activity-source .litera-submit-answers,.litera-activity-source [data-litera-trace-controls]{display:none!important}
.litera-activity-page__content>[data-activity-item]{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;min-height:10rem!important;visibility:visible!important;pointer-events:auto!important}
.litera-activity-page__content .litera-response,.litera-activity-page__content .litera-matching-game{visibility:visible!important;pointer-events:auto!important;max-width:none!important}
</style>`;
  let output = html.replace(/<\/head>/i, `${css}${interactionCss}${fidelityCss}${structuralOverrides}</head>`);
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(output, "text/html");
    // Tables are structural, not loose decoration. Mark numeric cells so the
    // shared renderer keeps every number at the same sturdy textbook weight,
    // and remove accidental empty edge fragments outside the table grid.
    document.querySelectorAll<HTMLElement>("table td, table th").forEach((cell) => {
      if (/^[\s\d+\-−=×÷.,/]+$/.test(cell.textContent ?? ""))
        cell.dataset.numericLayout = "true";
    });
    const looseDigits = [...document.querySelectorAll<HTMLElement>('[data-layout-block][data-numeric-layout="true"]')]
      .filter((node) => /^\d$/.test(node.textContent?.trim() ?? ""));
    const digitColumns: HTMLElement[][] = [];
    looseDigits.forEach((node) => {
      const left = Number.parseFloat(node.style.left);
      if (!Number.isFinite(left)) return;
      const column = digitColumns.find((items) =>
        Math.abs(Number.parseFloat(items[0]!.style.left) - left) <= .3,
      );
      if (column) column.push(node);
      else digitColumns.push([node]);
    });
    digitColumns.filter((column) => column.length >= 4).forEach((column) => {
      const fontSize = Math.max(...column.map((node) => Number.parseFloat(node.style.fontSize)).filter(Number.isFinite));
      const columnLeft = Number.parseFloat(column[0]!.style.left);
      const verticalRules = [...document.querySelectorAll<HTMLElement>(".source-rule")]
        .map((rule) => ({
          left: Number.parseFloat(rule.style.left),
          height: Number.parseFloat(rule.style.height),
        }))
        .filter((rule) => Number.isFinite(rule.left) && rule.height >= 30)
        .sort((a, b) => a.left - b.left);
      const leftRule = [...verticalRules].reverse().find((rule) => rule.left <= columnLeft);
      const rightRule = verticalRules.find((rule) => rule.left > columnLeft);
      const measuredLeft = leftRule?.left ?? columnLeft;
      const measuredWidth = leftRule && rightRule
        ? rightRule.left - leftRule.left
        : Math.max(...column.map((node) => Number.parseFloat(node.style.width)).filter(Number.isFinite));
      const columnCenterY = column.reduce(
        (sum, node) => sum + Number.parseFloat(node.style.top),
        0,
      ) / column.length;
      let ownerTablePanel: HTMLElement | undefined;
      [...document.querySelectorAll<HTMLElement>(".activity-panel")].forEach((panel) => {
        const left = Number.parseFloat(panel.style.left);
        const top = Number.parseFloat(panel.style.top);
        const width = Number.parseFloat(panel.style.width);
        const height = Number.parseFloat(panel.style.height);
        if (
          measuredLeft >= left && measuredLeft <= left + width &&
          columnCenterY >= top && columnCenterY <= top + height
        ) {
          ownerTablePanel = panel;
          panel.dataset.literaTableOutline = "true";
          panel.style.setProperty(
            "--litera-outline-color",
            panel.style.borderColor || safeAccent,
          );
          if (!document.querySelector('.source-figure-table-outline')) {
            const outline = document.createElement("div");
            outline.className = "source-figure-table-outline";
            outline.setAttribute("aria-hidden", "true");
            outline.setAttribute(
              "style",
              `left:${left}%;top:${top}%;width:${width}%;height:${height}%;--litera-outline-color:${panel.style.borderColor || safeAccent}`,
            );
            document.querySelector("main[data-litera-page]")?.append(outline);
          }
          const panelRules = [...document.querySelectorAll<HTMLElement>(".source-rule")];
          panelRules.forEach((rule) => {
            const ruleTop = Number.parseFloat(rule.style.top);
            const ruleWidth = Number.parseFloat(rule.style.width);
            const ruleHeight = Number.parseFloat(rule.style.height);
            if (
              ruleTop >= top && ruleTop <= top + height &&
              ruleWidth >= width * .62 && ruleHeight <= .5
            ) {
              rule.style.left = `${left}%`;
              rule.style.width = `${width}%`;
            }
          });
          const verticalSegments = panelRules
            .map((rule) => ({
              left: Number.parseFloat(rule.style.left),
              top: Number.parseFloat(rule.style.top),
              height: Number.parseFloat(rule.style.height),
            }))
            .filter((rule) =>
              rule.left > left + width * .45 && rule.left < left + width * .9 &&
              rule.top >= top && rule.top <= top + height && rule.height >= 3,
            );
          const dividerGroups = new Map<number, typeof verticalSegments>();
          verticalSegments.forEach((segment) => {
            const key = Math.round(segment.left * 10) / 10;
            dividerGroups.set(key, [...(dividerGroups.get(key) ?? []), segment]);
          });
          const divider = [...dividerGroups.values()].sort((a, b) => b.length - a.length)[0];
          if (divider && divider.length >= 4 && !document.querySelector('.source-table-column-divider')) {
            const dividerTop = Math.min(...divider.map((segment) => segment.top));
            const dividerBottom = Math.max(...divider.map((segment) => segment.top + segment.height));
            const dividerLine = document.createElement("div");
            dividerLine.className = "source-table-column-divider";
            dividerLine.setAttribute("aria-hidden", "true");
            dividerLine.setAttribute(
              "style",
              `left:${divider[0]!.left}%;top:${dividerTop}%;height:${dividerBottom - dividerTop}%;--litera-outline-color:${panel.style.borderColor || safeAccent}`,
            );
            document.querySelector("main[data-litera-page]")?.append(dividerLine);
          }
        }
      });
      column.forEach((node) => {
        node.dataset.literaNumericColumn = "true";
        node.style.left = `${measuredLeft.toFixed(3)}%`;
        node.style.setProperty("--litera-column-font-size", `${fontSize.toFixed(3)}cqw`);
        node.style.setProperty("--litera-column-width", `${measuredWidth.toFixed(3)}%`);
        const nodeTop = Number.parseFloat(node.style.top);
        const nodeLeft = Number.parseFloat(node.style.left);
        const horizontalRules = [...document.querySelectorAll<HTMLElement>(".source-rule")]
          .map((rule) => ({
            top: Number.parseFloat(rule.style.top),
            width: Number.parseFloat(rule.style.width),
          }))
          .filter((rule) => Number.isFinite(rule.top) && rule.width >= 50)
          .sort((a, b) => a.top - b.top);
        const rowTop = [...horizontalRules].reverse().find((rule) => rule.top <= nodeTop + .5)?.top;
        const rowBottom = horizontalRules.find((rule) => rowTop !== undefined && rule.top > rowTop + 1)?.top;
        if (rowTop !== undefined && rowBottom !== undefined) {
          const rowHeight = rowBottom - rowTop;
          node.dataset.literaCellCentered = "true";
          node.style.top = `${rowTop.toFixed(3)}%`;
          node.style.setProperty("--litera-cell-height", `${rowHeight.toFixed(3)}%`);
          const rowFigures = [...document.querySelectorAll<HTMLElement>("figure")].filter((figure) => {
            const top = Number.parseFloat(figure.style.top);
            const left = Number.parseFloat(figure.style.left);
            const height = Number.parseFloat(figure.style.height);
            const center = top + height / 2;
            return (
              Number.isFinite(center) && Number.isFinite(left) &&
              center >= rowTop && center <= rowBottom &&
              left < measuredLeft &&
              height <= (rowBottom - rowTop) * 2
            );
          });
          if (rowFigures.length) {
            const originalLeft = Math.min(...rowFigures.map((figure) => Number.parseFloat(figure.style.left)));
            const originalRight = Math.max(...rowFigures.map((figure) => Number.parseFloat(figure.style.left) + Number.parseFloat(figure.style.width)));
            const panelLeft = ownerTablePanel ? Number.parseFloat(ownerTablePanel.style.left) : originalLeft;
            const cellLeft = panelLeft + 1;
            const cellRight = measuredLeft - 1;
            const availableWidth = Math.max(1, cellRight - cellLeft);
            const groupWidth = Math.max(1, originalRight - originalLeft);
            const scale = Math.min(1, availableWidth / groupWidth);
            // Ordinary illustrated rows share one left inset. An example row
            // is different: the printed label precedes its demonstration
            // image, so retain the extracted image offset instead of moving
            // the picture in front of the label.
            const hasExampleLabel = [...document.querySelectorAll<HTMLElement>("[data-layout-block]")]
              .some((candidate) => {
                if (!/^example\b/i.test(candidate.textContent?.trim() ?? "")) return false;
                const top = Number.parseFloat(candidate.style.top);
                const height = Number.parseFloat(candidate.style.minHeight || candidate.style.height);
                const center = top + (Number.isFinite(height) ? height / 2 : 0);
                return center >= rowTop && center <= rowBottom &&
                  Number.parseFloat(candidate.style.left) < measuredLeft;
              });
            const targetLeft = hasExampleLabel
              ? Math.max(cellLeft, Math.min(originalLeft, cellRight - groupWidth * scale))
              : cellLeft;
            rowFigures.forEach((figure) => {
              const left = Number.parseFloat(figure.style.left);
              const width = Number.parseFloat(figure.style.width);
              figure.dataset.literaCellCentered = "figure";
              figure.style.top = `${rowTop.toFixed(3)}%`;
              figure.style.height = `${rowHeight.toFixed(3)}%`;
              figure.style.left = `${(targetLeft + (left - originalLeft) * scale).toFixed(3)}%`;
              figure.style.width = `${(width * scale).toFixed(3)}%`;
            });
          }
        }
        const word = [...document.querySelectorAll<HTMLElement>('[data-layout-block]')].find((candidate) => {
          const text = candidate.textContent?.trim() ?? "";
          const top = Number.parseFloat(candidate.style.top);
          const left = Number.parseFloat(candidate.style.left);
          return /^(?:one|two|three|four|five|six|seven|eight|nine|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa)$/i.test(text) &&
            Math.abs(top - nodeTop) <= 1.2 && left > nodeLeft && left - nodeLeft <= 12;
        });
        if (word && !word.dataset.literaNumberWordColumn) {
          const originalLeft = Number.parseFloat(word.style.left);
          const originalWidth = Number.parseFloat(word.style.width);
          word.dataset.literaNumberWordColumn = "true";
          word.dataset.literaCellCentered = "true";
          word.style.left = `${Math.max(originalLeft + .35, measuredLeft + measuredWidth + .55).toFixed(3)}%`;
          if (Number.isFinite(originalWidth))
            word.style.width = `${Math.max(1, originalWidth - .75).toFixed(3)}%`;
          if (rowTop !== undefined && rowBottom !== undefined) {
            word.style.top = `${rowTop.toFixed(3)}%`;
            word.style.setProperty("--litera-cell-height", `${(rowBottom - rowTop).toFixed(3)}%`);
          }
        }
      });
    });
    document.querySelectorAll<HTMLElement>("table").forEach((table) => {
      table.style.borderCollapse = "collapse";
      table.style.boxSizing = "border-box";
      const numberStyle = (element: HTMLElement, property: keyof CSSStyleDeclaration) =>
        Number.parseFloat(String(element.style[property] ?? ""));
      const left = numberStyle(table, "left");
      const top = numberStyle(table, "top");
      const width = numberStyle(table, "width");
      const height = numberStyle(table, "height");
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const owner = [...document.querySelectorAll<HTMLElement>(".activity-panel")]
        .map((panel) => ({
          panel,
          left: numberStyle(panel, "left"),
          top: numberStyle(panel, "top"),
          width: numberStyle(panel, "width"),
          height: numberStyle(panel, "height"),
        }))
        .filter(
          (panel) =>
            centerX >= panel.left - 1.5 &&
            centerX <= panel.left + panel.width + 1.5 &&
            centerY >= panel.top - 1.5 &&
            centerY <= panel.top + panel.height + 1.5,
        )
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
      if (owner && [left, top, width, height].every(Number.isFinite)) {
        const insetX = 1.2;
        const insetY = 1.2;
        const right = Math.min(
          left + width,
          owner.left + owner.width - insetX,
        );
        const bottom = Math.min(
          top + height,
          owner.top + owner.height - insetY,
        );
        const constrainedLeft = Math.max(left, owner.left + insetX);
        const constrainedTop = Math.max(top, owner.top + insetY);
        table.style.left = `${constrainedLeft.toFixed(3)}%`;
        table.style.top = `${constrainedTop.toFixed(3)}%`;
        table.style.width = `${Math.max(8, right - constrainedLeft).toFixed(3)}%`;
        table.style.height = `${Math.max(4, bottom - constrainedTop).toFixed(3)}%`;
      }
      table.querySelectorAll<HTMLElement>("tr").forEach((row) => {
        row.style.boxSizing = "border-box";
      });
    });
    rebuildImageCountingTable(document, safeAccent);
    // answerLines (geometry-storyboard-engine.ts) bundles several <style>
    // blocks directly into the rendered <main> markup, i.e. inside <body>,
    // not <head> - so a naive document.body.textContent includes their CSS
    // source. Every page with any answer-line target embeds a rule with
    // "color:#171717", which made isShadingActivityPage below true on
    // virtually every activity page regardless of its actual content,
    // silently skipping every activity's control insertion for that page.
    const bodyWithoutStyleScript = document.body.cloneNode(true) as HTMLElement;
    bodyWithoutStyleScript
      .querySelectorAll("style, script")
      .forEach((element) => element.remove());
    const pageText = bodyWithoutStyleScript.textContent ?? "";
    const sourceUsesRaisedWordCards =
      /\b(?:read aloud the following numbers|draw lines? to match each word)\b/i.test(
        pageText,
      );
    if (sourceUsesRaisedWordCards) {
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-layout-block]",
      )) {
        const value = (element.textContent ?? "").trim();
        if (
          /^(?:zero|one|two|three|four|five|six|seven|eight|nine)$/i.test(
            value,
          )
        )
          element.classList.add("litera-source-word-card");
      }
    }
    const isActivityPage =
      /\b(?:activity|exercise|practice|zoezi|shughuli|maswali|write|answer|complete|fill|andika|jibu|jaza)\b/i.test(
        pageText,
      );
    const isOralPage =
      /\b(?:read|practise|practice)\b[^.]{0,80}\baloud\b|\b(?:answer|describe|discuss|say)\b[^.]{0,80}\borally\b|\bsoma\s+kwa\s+sauti\b/i.test(
        pageText,
      );
    const isShadingActivityPage =
      /\b(?:tia\s+kivuli|shade|colour|color)\b/i.test(pageText);
    if (isActivityPage && !isOralPage)
      insertInlineBlankControls(document, document.body, {
        id: "printed-answer-blanks",
        pageNumber: 0,
        type: "fill-blank",
        prompt: "Complete the printed answer spaces",
        inputMode: "text",
        confidence: 1,
        responseMode: "text",
        accessibilityHint: "Type an answer in each printed blank.",
      });
    const positionalControls = [
      ...document.querySelectorAll<HTMLInputElement>(
        ".source-answer-line input:not([data-activity-item])",
      ),
    ];
    const layoutMatchingPairs =
      /\b(?:match|matching|oanisha|linganisha)\b/i.test(pageText)
        ? matchingPairsFromLayout(document, positionalControls.length)
        : [];
    let layoutMatchingInserted = false;
    if (layoutMatchingPairs.length >= 2) {
      const matchingActivity: StructuredPage["activities"][number] = {
        id: "layout-matching-game",
        pageNumber: 0,
        type: "matching",
        prompt: "Match each item with the correct option",
        confidence: 0.86,
        responseMode: "choice",
        accessibilityHint: "Choose one match for each item.",
        inputMode: "text",
        matchingPairs: layoutMatchingPairs,
      };
      const matchingTarget =
        findActivityTarget(document, "match") ??
        findActivityTarget(document, "oanisha") ??
        findActivityTarget(document, "linganisha");
      if (matchingTarget) {
        appendActivityExtension(document, activityControlHtml(matchingActivity));
        layoutMatchingInserted = true;
      }
    }
    for (const activity of activities) {
      // Geometry pages with a shading canvas already contain their direct
      // manipulation control and any separately printed response rules. Do
      // not add generic numbered answer popovers around the page edge.
      if (isShadingActivityPage) continue;
      if (activity.responseMode === "none" || activity.type === "no-input")
        continue;
      // Shading/colouring tasks interact directly with the preserved diagram
      // canvas. Treating their numbered rows as short-answer questions adds
      // unrelated floating text controls along the page edge.
      if (
        /\b(?:tia\s+kivuli|shade|colour|color)\b/i.test(activity.prompt)
      )
        continue;
      if (layoutMatchingInserted && activity.type === "matching") continue;
      if (document.querySelector(`[data-activity-item="${activity.id}"]`))
        continue;
      if (activity.type === "multiple-choice") {
        const visualKeyword = /\bfew\b/i.test(activity.prompt)
          ? "few"
          : /\bmany\b/i.test(activity.prompt)
            ? "many"
            : undefined;
        const directVisualChoices = [
          ...document.querySelectorAll<HTMLInputElement>(
            ".illustration-choice input[type='radio']",
          ),
        ].filter((input) => {
          if (!visualKeyword) return true;
          return input
            .closest<HTMLElement>(".illustration-choice")
            ?.getAttribute("aria-label")
            ?.toLocaleLowerCase()
            .includes(visualKeyword);
        });
        const allVisualChoices = [
          ...document.querySelectorAll<HTMLInputElement>(
            ".illustration-choice input[type='radio']",
          ),
        ];
        // A concrete row-by-row illustrated choice is authoritative. Never
        // cover it with the generic A/B/C/D fallback merely because OCR used
        // "many" in one continuation fragment and "few" in another.
        if (directVisualChoices.length >= 2 || (visualKeyword && allVisualChoices.length >= 2)) {
          const ownedChoices = directVisualChoices.length >= 2
            ? directVisualChoices
            : allVisualChoices;
          ownedChoices.forEach((input, index) => {
            input.setAttribute(
              "data-activity-item",
              activity.id + "-" + (index + 1),
            );
          });
          continue;
        }
      }
      if (
        activity.type === "drawing" &&
        document.querySelector("[data-litera-tracing-activity]")
      ) {
        document
          .querySelector("[data-litera-tracing-activity]")
          ?.setAttribute("data-activity-item", activity.id);
        continue;
      }
      const control = activityControlHtml(activity);
      const target =
        findActivityTarget(document, activity.prompt) ??
        (activity.type === "drawing"
          ? (findActivityTarget(document, "trace") ??
            findActivityTarget(document, "draw") ??
            findActivityTarget(document, "copy") ??
            findActivityTarget(document, "fuatisha"))
          : activity.type === "matching"
          ? (findActivityTarget(document, "match") ??
            findActivityTarget(document, "oanisha") ??
            findActivityTarget(document, "linganisha"))
          : activity.type === "true-false"
            ? (findActivityTarget(document, "true false") ??
              findActivityTarget(document, "kweli si kweli"))
            : activity.type === "multiple-choice"
              ? (findActivityTarget(document, "choose answer") ??
                findActivityTarget(document, "chagua jibu"))
              : undefined);
      if (
        activity.type === "fill-blank" &&
        insertInlineBlankControls(document, document.body, activity)
      )
        continue;
      if (
        activity.type === "short-answer" &&
        insertNumberedQuestionControls(document, activity)
      )
        continue;
      // Worked examples demonstrate completed solutions. A printed blank inside
      // an example is part of the explanation, not a learner activity.
      if (target?.closest(".example, [data-section-type='example']")) continue;
      if (
        target &&
        ["true-false", "multiple-choice"].includes(activity.type)
      ) {
        insertActivityControl(target, control);
        continue;
      }
      if (activity.type === "matching") {
        const hasKnownPairs = Boolean(
          activity.matchingPairs?.length ||
            (activity.options?.length && activity.options.length >= 4),
        );
        if (hasKnownPairs) appendActivityExtension(document, control);
        else insertMatchingCanvasOverlay(document, activity, target, safeAccent);
        continue;
      }
      if (target && activity.type === "drawing") {
        insertActivityControl(target, control);
        continue;
      }
      const existingControl = target
        ? nearbyResponseControl(target)
        : undefined;
      if (existingControl) {
        existingControl.setAttribute("data-activity-item", activity.id);
        if (!existingControl.getAttribute("aria-label"))
          existingControl.setAttribute(
            "aria-label",
            activity.prompt.slice(0, 120),
          );
      } else if (positionalControls.length) {
        const count = Math.max(1, activity.answerCount ?? 1);
        for (let index = 0; index < count; index += 1) {
          const input = positionalControls.shift();
          if (!input) break;
          input.setAttribute(
            "data-activity-item",
            count > 1 ? `${activity.id}-${index + 1}` : activity.id,
          );
          const answer = activity.correctAnswers?.[index];
          if (answer) input.setAttribute("data-correct-answer", answer);
          input.setAttribute(
            "aria-label",
            `${activity.prompt.slice(0, 100)}${count > 1 ? `, answer ${index + 1}` : ""}`,
          );
        }
      } else if (target) insertActivityControl(target, control);
      else if (!document.querySelector("[data-layout-block]"))
        // Flow-based pages can safely receive a trailing response. A measured
        // source-layout page cannot: an unanchored control lands at the page
        // origin and overlaps unrelated content. Geometry pages only receive
        // controls when a printed blank, equation, or question target exists.
        document
          .querySelector("main[data-litera-page]")
          ?.insertAdjacentHTML("beforeend", control);
    }
    // A visual matching exercise may have no extractable text pairs because
    // its left column consists entirely of pictures. It must still expose an
    // accessible matching control instead of remaining a static illustration.
    for (const activity of activities.filter(
      (candidate) => candidate.type === "matching",
    )) {
      if (document.querySelector(`[data-activity-item="${activity.id}"]`))
        continue;
      const target =
        findActivityTarget(document, activity.prompt) ??
        findActivityTarget(document, "match");
      if (target) {
        const hasKnownPairs = Boolean(
          activity.matchingPairs?.length ||
            (activity.options?.length && activity.options.length >= 4),
        );
        if (hasKnownPairs)
          appendActivityExtension(document, activityControlHtml(activity));
        else insertMatchingCanvasOverlay(document, activity, target, safeAccent);
      }
    }
    installActivityLaunchers(document, activities);
    const answerControls = document.querySelectorAll(
      ".litera-response input:not([type=hidden]), .litera-response select, .litera-response textarea, .source-answer-line input",
    );
    if (answerControls.length && !document.querySelector("[data-litera-submit]")) {
      document.head.insertAdjacentHTML(
        "beforeend",
        `<style data-litera-submit-style>.litera-submit-all{position:absolute;z-index:20;right:3%;bottom:2.5%;padding:.65em 1.35em;border:0;border-radius:999px;background:${safeAccent};color:#fff;font:700 1em/1.2 system-ui;box-shadow:0 .25em .8em #0003;cursor:pointer}.litera-submit-all:disabled{cursor:not-allowed;opacity:.45}</style>`,
      );
      document.querySelector("main[data-litera-page]")?.insertAdjacentHTML(
        "beforeend",
        `<button class="litera-submit-all" data-litera-submit type="button" disabled>${escapeHtmlAttribute(localizedAnswerSubmitLabel(pageText))}</button>`,
      );
    }
    const hasAnswerRuntime = [...document.scripts].some((script) =>
      script.textContent?.includes("litera-answer-feedback"),
    );
    if (!hasAnswerRuntime)
      document.body.insertAdjacentHTML("beforeend", answerFeedbackRuntime());
    else if (
      document.querySelector(".litera-matching-game") &&
      !document.querySelector("script[data-litera-matching-runtime]")
    )
      document.body.insertAdjacentHTML("beforeend", matchingGameRuntime());
    return `<!doctype html>${document.documentElement.outerHTML}`;
  }
  for (const activity of activities) {
    const id = escapeRegExp(activity.id);
    const control = activityControlHtml(activity);
    output = output.replace(
      new RegExp(
        `<([a-z][\\w:-]*)\\b(?=[^>]*\\bdata-id=["']${id}["'])[^>]*>[^<]*<\\/\\1>`,
        "i",
      ),
      (match) => match.replace(/<\/([a-z][\w:-]*)>$/i, `${control}</$1>`),
    );
  }
  return output.replace(/<\/body>/i, `${answerFeedbackRuntime()}</body>`);
}

function rebuildImageCountingTable(document: Document, accent: string) {
  const main = document.querySelector<HTMLElement>("main[data-litera-page]");
  if (
    !main ||
    main.querySelector("[data-litera-image-count-table]") ||
    !/count each type of[\s\S]{0,40}(?:and\s+)?write the total/i.test(
      main.textContent ?? "",
    )
  ) return;
  const percent = (element: HTMLElement, property: keyof CSSStyleDeclaration) =>
    Number.parseFloat(String(element.style[property] ?? ""));
  const blocks = [...main.querySelectorAll<HTMLElement>("[data-layout-block]")];
  const fruitsLabel = blocks.find((block) => /^fruits?\s*:?[\s]*$/i.test(block.textContent?.trim() ?? ""));
  const totalLabel = blocks.find((block) => /^total\s*:?[\s]*$/i.test(block.textContent?.trim() ?? ""));
  if (!fruitsLabel || !totalLabel) return;
  const fruitTop = percent(fruitsLabel, "top");
  const fruitLeft = percent(fruitsLabel, "left");
  const fruitCenterY = fruitTop + percent(fruitsLabel, "minHeight") / 2;
  const panel = [...main.querySelectorAll<HTMLElement>(".activity-panel")]
    .map((node) => ({
      node,
      left: percent(node, "left"),
      top: percent(node, "top"),
      width: percent(node, "width"),
      height: percent(node, "height"),
    }))
    .find((item) =>
      fruitLeft >= item.left - 1 &&
      fruitLeft <= item.left + item.width + 1 &&
      fruitCenterY >= item.top &&
      fruitCenterY <= item.top + item.height,
    );
  if (!panel) return;
  const headerFigures = [...main.querySelectorAll<HTMLElement>("figure")]
    .filter((figure) => {
      const top = percent(figure, "top");
      const left = percent(figure, "left");
      const width = percent(figure, "width");
      return (
        top >= fruitTop - 5 &&
        top <= fruitTop + 9 &&
        left + width / 2 > fruitLeft + 8 &&
        left >= panel.left - 1 &&
        left <= panel.left + panel.width + 1
      );
    })
    .sort((a, b) => percent(a, "left") - percent(b, "left"));
  if (headerFigures.length < 2) return;
  const uniqueFigures = headerFigures.filter((figure, index) => {
    const center = percent(figure, "left") + percent(figure, "width") / 2;
    return !headerFigures.slice(0, index).some((previous) =>
      Math.abs(percent(previous, "left") + percent(previous, "width") / 2 - center) < 2,
    );
  });
  const answers = [...main.querySelectorAll<HTMLInputElement>(
    '.source-answer-line input[inputmode="decimal"],.source-answer-line input[inputmode="numeric"]',
  )]
    .filter((input) => {
      const owner = input.closest<HTMLElement>(".source-answer-line");
      return owner && percent(owner, "top") >= fruitTop;
    })
    .sort((a, b) => {
      const ownerA = a.closest<HTMLElement>(".source-answer-line")!;
      const ownerB = b.closest<HTMLElement>(".source-answer-line")!;
      return percent(ownerA, "left") - percent(ownerB, "left");
    });
  const targetColumns = answers.length >= 4 ? answers.length : 9;
  const totalFigureWidth = uniqueFigures.reduce(
    (sum, figure) => sum + percent(figure, "width"),
    0,
  );
  const allocations = uniqueFigures.map((figure) => {
    const exact = percent(figure, "width") / Math.max(1, totalFigureWidth) * targetColumns;
    return { figure, exact, count: Math.max(1, Math.floor(exact)) };
  });
  while (allocations.reduce((sum, item) => sum + item.count, 0) < targetColumns) {
    allocations
      .filter((item) => item.count < Math.ceil(item.exact))
      .sort((a, b) => (b.exact - b.count) - (a.exact - a.count))[0]!.count += 1;
  }
  while (allocations.reduce((sum, item) => sum + item.count, 0) > targetColumns) {
    const reducible = allocations
      .filter((item) => item.count > 1)
      .sort((a, b) => (a.exact - a.count) - (b.exact - b.count))[0];
    if (!reducible) break;
    reducible.count -= 1;
  }
  const tableTop = Math.max(fruitTop - 2.2, panel.top + panel.height * .62);
  const tableBottom = panel.top + panel.height - 1.2;
  const imageGroups = allocations.flatMap(({ figure, count }) => {
    const image = figure.querySelector<HTMLImageElement>("img");
    if (!image) return [];
    const src = escapeHtmlAttribute(image.getAttribute("src") ?? "");
    const alt = escapeHtmlAttribute(image.alt || "Fruit illustration");
    return [{
      count,
      html: `<td colspan="${count}" class="source-image-count-group" style="--fruit-columns:${count}"><img src="${src}" alt="${alt}"></td>`,
    }];
  });
  const answerCells = Array.from({ length: targetColumns }, (_, index) => {
    const correct = answers[index]?.dataset.correctAnswer;
    return `<td><input type="text" inputmode="numeric" autocomplete="off" aria-label="Total for fruit ${index + 1}"${correct ? ` data-correct-answer="${escapeHtmlAttribute(correct)}"` : ""}></td>`;
  }).join("");
  const table = document.createElement("table");
  table.dataset.literaImageCountTable = "true";
  table.className = "source-data-table source-image-count-table";
  table.setAttribute("aria-label", "Count each pictured fruit and write its total");
  table.setAttribute(
    "style",
    `--source-table-accent:${accent};position:absolute;z-index:7;left:${(panel.left + 1.2).toFixed(3)}%;top:${tableTop.toFixed(3)}%;width:${Math.max(20, panel.width - 2.4).toFixed(3)}%;height:${Math.max(8, tableBottom - tableTop).toFixed(3)}%;border-collapse:separate;border-spacing:0;table-layout:fixed;border:.12cqw solid ${accent};border-radius:1.35cqw;overflow:hidden;background:#fff`,
  );
  const sourceAlignedWeights = allocations.map((item) => item.count).join("-") === "2-5-2"
    ? [73, 78, 65, 62, 70, 103, 80, 74, 80]
    : Array.from({ length: targetColumns }, () => 1);
  const weightTotal = sourceAlignedWeights.reduce((sum, weight) => sum + weight, 0);
  const dataWidth = 84;
  table.innerHTML = `<caption class="sr-only">Fruit totals</caption><colgroup><col style="width:16%">${sourceAlignedWeights.map((weight) => `<col style="width:${(dataWidth * weight / weightTotal).toFixed(4)}%">`).join("")}</colgroup><tbody><tr><th scope="row">Fruits</th>${imageGroups.map((group) => group.html).join("")}</tr><tr><th scope="row">Total</th>${answerCells}</tr></tbody>`;
  [...main.children].forEach((child) => {
    if (!(child instanceof HTMLElement) || child === panel.node) return;
    const top = percent(child, "top");
    const left = percent(child, "left");
    if (
      Number.isFinite(top) && Number.isFinite(left) &&
      top >= tableTop - 2.5 &&
      left >= panel.left - 1 &&
      left <= panel.left + panel.width + 1 &&
      (child.matches("figure,.source-rule,.source-answer-line") ||
        child === fruitsLabel || child === totalLabel ||
        (child.matches("[data-layout-block]") && /^\d+$/.test(child.textContent?.trim() ?? "")))
    ) child.remove();
  });
  main.append(table);
}

function matchingPairsFromLayout(document: Document, expectedCount: number) {
  const numberValues: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  const visualPairs = [
    ...document.querySelectorAll<HTMLImageElement>("figure img[alt]"),
  ].flatMap((image, index) => {
    const description = (image.alt ?? "").replace(/\s+/g, " ").trim();
    if (!description || /\bexample\b/i.test(description)) return [];
    const word = description.toLocaleLowerCase().match(
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
    )?.[1];
    if (!word) return [];
    return [{ left: description || `Picture ${index + 1}`, right: numberValues[word]! }];
  });
  const uniqueVisualPairs = visualPairs.filter(
    (pair, index, pairs) =>
      pairs.findIndex(
        (candidate) => candidate.left === pair.left && candidate.right === pair.right,
      ) === index,
  );
  if (uniqueVisualPairs.length >= 2) return uniqueVisualPairs;
  const labels: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-layout-block]",
  )) {
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const left = Number(
      (element.getAttribute("style") ?? "").match(
        /(?:^|;)\s*left\s*:\s*([\d.]+)%/i,
      )?.[1] ?? 0,
    );
    if (
      left < 58 ||
      !text ||
      text.length > 52 ||
      /^(?:column(?: [ab])?|[ab]|s\/n|[-–—_]{3,}|\d{1,2}\/\d{1,2}\/\d{4}.*)$/i.test(
        text,
      ) ||
      /\b(?:match|study|provided|pictures|objects|example)\b/i.test(text)
    )
      continue;
    if (labels.at(-1)?.endsWith(" or")) labels[labels.length - 1] += ` ${text}`;
    else if (/^(?:\d{1,2}|[\p{L}][\p{L}\s'-]+)$/u.test(text)) labels.push(text);
  }
  const uniqueLabels = [...new Set(labels)];
  const pairCount = expectedCount >= 2 ? expectedCount : uniqueLabels.length;
  if (pairCount < 2) return [];
  return uniqueLabels
    .slice(0, pairCount)
    .map((right, index) => ({ left: `Picture ${index + 1}`, right }));
}

function insertNumberedQuestionControls(
  document: Document,
  activity: StructuredPage["activities"][number],
) {
  if (document.querySelector(".litera-question-answer")) return true;
  // 3+ printed answer-line targets usually means some other mechanism
  // already handled this activity's blanks - but only once they're actually
  // claimed. Unclaimed lines (no data-activity-item yet) still need the
  // caller's own positionalControls pass, so bailing out here as "handled"
  // would silently leave them empty instead - as happened for a
  // multi-number "write these numbers in numerals" exercise whose 9 printed
  // blanks were never claimed by anything once this returned true first.
  if (
    document.querySelectorAll(".source-answer-line").length >= 3 &&
    document.querySelectorAll(".source-answer-line input:not([data-activity-item])").length === 0
  )
    return true;
  const candidates = [
    ...document.querySelectorAll<HTMLElement>("[data-layout-block]"),
  ].filter((element) =>
    /^\s*(\d{1,2})(?:[.)]\s*\S|[.)]?\s*)$/.test(element.textContent ?? ""),
  );
  if (candidates.length < 3) return false;
  const layoutBlocks = [
    ...document.querySelectorAll<HTMLElement>("[data-layout-block]"),
  ].map((element) => ({
    element,
    top: Number(
      (element.getAttribute("style") ?? "").match(
        /(?:^|;)\s*top\s*:\s*([\d.]+)%/i,
      )?.[1] ?? 0,
    ),
  }));
  let inserted = 0;
  for (const [candidateIndex, target] of candidates.entries()) {
    if (target.closest(".example, [data-section-type='example']")) continue;
    const match = (target.textContent ?? "").match(/^\s*(\d{1,2})/);
    const questionNumber = match?.[1];
    if (!questionNumber) continue;
    const style = target.getAttribute("style") ?? "";
    const top = Number(style.match(/(?:^|;)\s*top\s*:\s*([\d.]+)%/i)?.[1] ?? 0);
    if (!top) continue;
    const nextStyle =
      candidates[candidateIndex + 1]?.getAttribute("style") ?? "";
    const nextTop = Number(
      nextStyle.match(/(?:^|;)\s*top\s*:\s*([\d.]+)%/i)?.[1] ?? 101,
    );
    const questionText = layoutBlocks
      .filter(
        ({ element, top: blockTop }) =>
          element !== target && blockTop >= top && blockTop < nextTop,
      )
      .map(({ element }) => element.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const correctAnswer = inferCorrectAnswers(questionText)[0];
    const id = `${activity.id}-question-${questionNumber}`;
    const label = escapeHtmlAttribute(
      `Answer question ${questionNumber}: ${(target.textContent ?? activity.prompt).slice(0, 90)}`,
    );
    target.insertAdjacentHTML(
      "afterend",
      `<details class="litera-question-answer" data-activity-item="${id}" style="top:${top.toFixed(3)}%"><summary aria-label="Open answer for question ${questionNumber}">${questionNumber}</summary><label class="litera-response"><span class="sr-only">${label}</span><input type="text" inputmode="${activity.inputMode ?? "text"}" autocomplete="off" aria-label="${label}"${correctAnswer ? ` data-correct-answer="${escapeHtmlAttribute(correctAnswer)}" aria-describedby="${id}-feedback"` : ""}>${correctAnswer ? `<span class="litera-answer-feedback" id="${id}-feedback" aria-live="polite"></span>` : ""}</label></details>`,
    );
    inserted += 1;
  }
  return inserted >= 3;
}

function insertInlineBlankControls(
  document: Document,
  target: Element,
  activity: StructuredPage["activities"][number],
) {
  const pattern = /(?:[_\u2013\u2014-]\s*){3,}/g;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  let answerIndex = 0;
  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (
      !parent ||
      parent.closest(
        ".example, [data-section-type='example'], .litera-response, .litera-inline-answer, script, style",
      )
    )
      continue;
    if (answerIndex >= (activity.answerCount ?? Number.POSITIVE_INFINITY))
      break;
    const value = textNode.nodeValue ?? "";
    if (!pattern.test(value)) {
      pattern.lastIndex = 0;
      continue;
    }
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      if (answerIndex >= (activity.answerCount ?? Number.POSITIVE_INFINITY))
        break;
      const start = match.index ?? 0;
      fragment.append(value.slice(cursor, start));
      const index = answerIndex++;
      const label = document.createElement("label");
      label.className = "litera-inline-answer";
      label.setAttribute("data-activity-item", `${activity.id}-${index + 1}`);
      const hidden = document.createElement("span");
      hidden.className = "sr-only";
      hidden.textContent = `Answer ${index + 1}: ${activity.prompt.slice(0, 100)}`;
      const input = document.createElement("input");
      input.type = activity.inputType ?? "text";
      input.inputMode = activity.inputMode ?? "text";
      input.autocomplete = "off";
      input.setAttribute("aria-label", hidden.textContent);
      const answer = activity.correctAnswers?.[index];
      if (answer) input.dataset.correctAnswer = answer;
      const feedbackId = `${activity.id}-feedback-${index + 1}`;
      input.setAttribute("aria-describedby", feedbackId);
      const feedback = document.createElement("span");
      feedback.className = "litera-answer-feedback";
      feedback.id = feedbackId;
      feedback.setAttribute("aria-live", "polite");
      label.append(hidden, input, feedback);
      fragment.append(label);
      cursor = start + match[0].length;
    }
    fragment.append(value.slice(cursor));
    textNode.replaceWith(fragment);
  }
  return answerIndex > 0;
}

function nearbyResponseControl(target: Element) {
  const selector = "input:not([type=hidden]), textarea, select";
  if (target.matches(selector)) return target;
  const inside = target.querySelector(selector);
  if (inside) return inside;
  const sibling = target.nextElementSibling;
  if (sibling?.matches(selector)) return sibling;
  return sibling?.querySelector(selector) ?? undefined;
}

function insertMatchingCanvasOverlay(
  document: Document,
  activity: StructuredPage["activities"][number],
  target: Element | undefined,
  accent: string,
) {
  const main = document.querySelector<HTMLElement>("main[data-litera-page]");
  if (!main || main.querySelector(`[data-activity-item="${activity.id}"]`))
    return;
  const percentOfStyle = (element: Element, property: string) =>
    Number(
      (element.getAttribute("style") ?? "").match(
        new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([\\d.]+)%`, "i"),
      )?.[1] ?? NaN,
    );
  const targetTop = target ? percentOfStyle(target, "top") : NaN;
  const panels = [
    ...document.querySelectorAll<HTMLElement>(".activity-panel"),
  ];
  const panel = panels.find((candidate) => {
    const top = percentOfStyle(candidate, "top");
    const height = percentOfStyle(candidate, "height");
    return Number.isFinite(targetTop) && targetTop >= top && targetTop <= top + height;
  }) ?? panels.at(-1);
  const left = panel ? percentOfStyle(panel, "left") + 1 : 8;
  const panelTop = panel ? percentOfStyle(panel, "top") : 18;
  const panelWidth = panel ? percentOfStyle(panel, "width") - 2 : 84;
  const panelHeight = panel ? percentOfStyle(panel, "height") : 68;
  const top = Number.isFinite(targetTop)
    ? Math.max(panelTop + 8, targetTop + 5)
    : panelTop + 10;
  const height = Math.max(20, panelTop + panelHeight - top - 1);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<section data-activity-item="${activity.id}" aria-label="Interactive line matching"><canvas data-litera-drawing-canvas width="900" height="1100" aria-label="Draw lines to match the items" style="position:absolute;z-index:12;left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${panelWidth.toFixed(2)}%;height:${height.toFixed(2)}%;touch-action:none;background:transparent;cursor:crosshair"></canvas><button type="button" data-litera-clear-drawing style="position:absolute;z-index:13;left:${left.toFixed(2)}%;top:${Math.min(96, top + height + .5).toFixed(2)}%;padding:.55cqw 1cqw;border:.1cqw solid ${accent};border-radius:999px;background:#fff;color:${accent};font:700 1.25cqw/1 system-ui">Clear matching lines</button><span class="sr-only" role="status" aria-live="polite">Draw a line from each item to its match.</span></section>`,
  );
}

function appendActivityExtension(document: Document, control: string) {
  const main = document.querySelector<HTMLElement>("main[data-litera-page]");
  if (!main) return;
  const styleText = [...document.querySelectorAll("style")]
    .map((style) => style.textContent ?? "")
    .join("\n");
  const ratio = styleText.match(
    /main\[data-litera-page\][^{]*\{[^}]*aspect-ratio\s*:\s*([\d.]+)\s*\/\s*([\d.]+)/i,
  );
  const width = Number(ratio?.[1] ?? 1);
  const height = Number(ratio?.[2] ?? 1.35);
  const sourceHeight = Number.isFinite(width) && width > 0
    ? (height / width) * 100
    : 135;
  main.classList.add("litera-has-activity-extension");
  main.insertAdjacentHTML(
    "beforeend",
    `<section class="litera-activity-extension" style="margin-top:${sourceHeight.toFixed(3)}cqw">${control}</section>`,
  );
}

function installActivityLaunchers(
  document: Document,
  activities: StructuredPage["activities"],
) {
  const playable = activities.filter(
    (activity) => activity.responseMode !== "none" && activity.type !== "no-input",
  );
  if (!playable.length || document.querySelector("[data-litera-activity-launchers]"))
    return;
  const main = document.querySelector<HTMLElement>("main[data-litera-page]");
  if (!main) return;
  const exercise = playable
    .map((activity) =>
      activity.prompt.match(
        /\b(?:exercise|activity|zoezi|shughuli)\s*\d*/i,
      )?.[0],
    )
    .find(Boolean);
  const short = exercise || "activity";
  const pageReference =
    document.querySelector<HTMLElement>(".source-folio,[data-litera-folio]")
      ?.textContent?.trim() || "Current page";
  const continuation = playable.some((activity) => activity.continuationOf)
    ? ` data-continuation="true"`
    : "";
  const labels = `<button type="button" class="litera-play-activity" data-litera-play-activity${continuation}>Play ${escapeHtmlAttribute(short)}</button>`;
  const illustratedTableAnswers = [
    ...document.querySelectorAll<HTMLElement>(
      '.source-answer-line[data-placement-evidence="image-number-table"] input',
    ),
  ];
  // The structure model may describe one illustrated counting table as two
  // broad activity fragments, while geometry has already recovered every
  // real response row. Build the separate activity from those source-backed
  // rows so a five-row fruit table yields five consistent numeric fields,
  // rather than two oversized generic answers.
  const sourceReplica = buildActivitySourceReplica(document);
  const activityContents = sourceReplica || (illustratedTableAnswers.length >= 3
    ? `<fieldset class="litera-response-set litera-illustrated-table-responses" style="--answer-count:1"><legend>Write the number for each illustrated row</legend>${illustratedTableAnswers.map((input, index) => {
        const correct = input.dataset.correctAnswer;
        return `<label class="litera-response" data-activity-item="illustrated-row-${index + 1}"><span>Row ${index + 1}</span><input type="text" inputmode="numeric" autocomplete="off" aria-label="Number for illustrated row ${index + 1}"${correct ? ` data-correct-answer="${escapeHtmlAttribute(correct)}"` : ""}></label>`;
      }).join("")}</fieldset>`
    : playable.map((activity) => activityControlHtml(activity)).join(""));
  document.body.insertAdjacentHTML(
    "beforeend",
    `<nav class="litera-activity-launchers" data-litera-activity-launchers aria-label="Interactive activities"><span>Ready to answer?</span>${labels}</nav>`,
  );
  document.body.insertAdjacentHTML(
    "beforeend",
    `<section class="litera-activity-page" data-litera-activity-page aria-label="Interactive activity"><header class="litera-activity-page__header"><div class="litera-activity-page__heading"><h2 class="litera-activity-page__title">${escapeHtmlAttribute(short)}</h2><p class="litera-activity-page__reference">Page ${escapeHtmlAttribute(pageReference.replace(/^page\s+/i, ""))}</p></div><button type="button" class="litera-close-activity" data-litera-close-activity>Close activity</button></header><p data-litera-continuation-note${continuation ? "" : " hidden"}>This exercise continues across printed pages. This activity contains every detected response from this part and shares the continuation identity used for marking.</p><div class="litera-activity-page__content" data-litera-activity-content>${activityContents}<button class="litera-submit-all" data-litera-submit type="button" disabled>Check answers</button></div></section>`,
  );
  document.body.insertAdjacentHTML(
    "beforeend",
    `<script data-litera-activity-launcher-runtime>(function(){
var main=document.querySelector('main[data-litera-page]'),page=document.querySelector('[data-litera-activity-page]'),content=document.querySelector('[data-litera-activity-content]'),close=document.querySelector('[data-litera-close-activity]'),lastButton=null;
if(!main||!page||!content||!close)return;
function closeActivity(){document.body.classList.remove('litera-activity-open');main.classList.remove('litera-activity-playing');if(lastButton){lastButton.setAttribute('aria-pressed','false');lastButton.focus({preventScroll:true})}}
document.querySelectorAll('[data-litera-play-activity]').forEach(function(button){button.addEventListener('click',function(){lastButton=button;document.body.classList.add('litera-activity-open');main.classList.add('litera-activity-playing');button.setAttribute('aria-pressed','true');var first=content.querySelector('input,select,textarea,button,[data-litera-trace-canvas]');if(first&&first.focus)first.focus({preventScroll:true})})});
close.addEventListener('click',closeActivity);document.addEventListener('keydown',function(event){if(event.key==='Escape'&&document.body.classList.contains('litera-activity-open'))closeActivity()})})()</script>`,
  );
}

function buildActivitySourceReplica(document: Document) {
  const main = document.querySelector<HTMLElement>("main[data-litera-page]");
  if (!main) return "";
  const percentOf = (element: Element, property: string) =>
    Number(
      (element.getAttribute("style") ?? "").match(
        new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([\\d.]+)%`, "i"),
      )?.[1] ?? NaN,
    );
  const panels = [...main.querySelectorAll<HTMLElement>(".activity-panel")]
    .map((panel) => ({
      panel,
      x: percentOf(panel, "left"),
      y: percentOf(panel, "top"),
      w: percentOf(panel, "width"),
      h: percentOf(panel, "height"),
    }))
    .filter((panel) =>
      [panel.x, panel.y, panel.w, panel.h].every(Number.isFinite),
    )
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const region = panels[0];
  if (!region || region.w < 20 || region.h < 8) return "";
  const clone = main.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.classList.add("litera-activity-playing", "litera-activity-source-page");
  clone.querySelectorAll("script,style,.source-folio,[data-litera-folio]").forEach((node) => node.remove());
  clone.style.width = `${(10000 / region.w).toFixed(4)}%`;
  clone.style.maxWidth = "none";
  clone.style.marginLeft = `${(-region.x * 100 / region.w).toFixed(4)}%`;
  clone.style.marginTop = `${(-region.y * 100 / region.w).toFixed(4)}%`;
  clone.style.visibility = "visible";
  clone.style.pointerEvents = "auto";
  const ratio = `${region.w} / ${region.h}`;
  return `<div class="litera-activity-source" style="container-type:inline-size;aspect-ratio:${ratio}">${clone.outerHTML}</div>`;
}

function insertActivityControl(target: Element, control: string) {
  if (!target.hasAttribute("data-layout-block")) {
    target.insertAdjacentHTML("afterend", control);
    return;
  }
  const style = target.getAttribute("style") ?? "";
  const percentOf = (source: string, property: string) =>
    Number(source.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([\\d.]+)%`, "i"))?.[1] ?? NaN);
  const left = style.match(/(?:^|;)\s*left\s*:\s*([\d.]+%)/i)?.[1] ?? "6%";
  const top = Number(style.match(/(?:^|;)\s*top\s*:\s*([\d.]+)%/i)?.[1] ?? 0);
  const height = Number(
    style.match(/(?:^|;)\s*min-height\s*:\s*([\d.]+)%/i)?.[1] ?? 2.5,
  );
  const width = style.match(/(?:^|;)\s*width\s*:\s*([\d.]+%)/i)?.[1] ?? "88%";

  // Anchoring right after the matched heading/instruction text places the
  // control a few lines below the *top* of the exercise, which often lands
  // it over the pictures or rows the exercise is actually testing rather
  // than below the exercise as a whole. buildActivityPanels
  // (geometry-storyboard-engine.ts) already computes each exercise's full
  // bounding box, spanning its heading down through every block/asset that
  // belongs to it, and renders it as an .activity-panel span - reuse that
  // instead of the heading's own (much shorter) bounds when the heading
  // falls inside one.
  const targetLeft = percentOf(style, "left");
  const targetTop = top;
  const panel = [...(target.ownerDocument.querySelectorAll<HTMLElement>(".activity-panel"))].find((candidate) => {
    const panelStyle = candidate.getAttribute("style") ?? "";
    const panelLeft = percentOf(panelStyle, "left");
    const panelTop = percentOf(panelStyle, "top");
    const panelWidth = percentOf(panelStyle, "width");
    const panelHeight = percentOf(panelStyle, "height");
    return (
      Number.isFinite(panelLeft) &&
      Number.isFinite(panelTop) &&
      targetLeft >= panelLeft - 1 &&
      targetLeft <= panelLeft + panelWidth + 1 &&
      targetTop >= panelTop - 1 &&
      targetTop <= panelTop + panelHeight + 1
    );
  });
  const panelBottom = panel
    ? percentOf(panel.getAttribute("style") ?? "", "top") + percentOf(panel.getAttribute("style") ?? "", "height")
    : NaN;
  const anchorBottom = Number.isFinite(panelBottom) && panelBottom > top + height ? panelBottom : top + height;
  target.insertAdjacentHTML(
    "afterend",
    `<div class="litera-response-group" style="left:${left};top:${Math.min(94, anchorBottom + 0.6).toFixed(2)}%;width:${width}">${control}</div>`,
  );
}

function findActivityTarget(document: Document, prompt: string) {
  // OCR often appends watermarks, answer labels and the printed folio to an
  // activity prompt. Match the leading instruction sentence so the response
  // control anchors beside the exercise instead of failing the overlap gate.
  // Some prompts (e.g. "Trace the following numbers by joining the dots 1 2
  // 3 4 5 6") lose their terminal period during OCR/extraction, so the list
  // of digits or number-words that follows the instruction never gets cut by
  // the sentence match below and dilutes the word-overlap score against the
  // short rendered heading. Cut before a trailing run of bare digits or
  // number-words too, not just at punctuation.
  const instruction = prompt
    .split(/\bfor online (?:reading|use) only\b/i)[0]
    ?.match(
      /^.*?(?:[.!?](?:\s|$)|(?=\s*(?:\d+\s*){3,}$)|(?=\s*(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*){2,}$))/i,
    )?.[0]
    ?.trim();
  const needle = normalizeSemanticText(instruction || prompt).toLocaleLowerCase();
  const needleWords = new Set(
    needle.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2),
  );
  let best: { element: Element; score: number } | undefined;
  for (const element of document.querySelectorAll(
    "[data-id], [data-layout-block], p, li, label",
  )) {
    if (element.closest(".litera-response")) continue;
    const text = normalizeSemanticText(
      element.textContent ?? "",
    ).toLocaleLowerCase();
    if (!text) continue;
    const exact = text.includes(needle) || needle.includes(text);
    const words = new Set(
      text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2),
    );
    const overlap =
      [...needleWords].filter((word) => words.has(word)).length /
      Math.max(1, needleWords.size);
    const score = exact
      ? 2 +
        Math.min(text.length, needle.length) /
          Math.max(text.length, needle.length)
      : overlap;
    if (score >= 0.48 && (!best || score > best.score))
      best = { element, score };
  }
  return best?.element.closest("p, li, div") ?? best?.element;
}

function traceTargetFromPrompt(prompt: string) {
  const digitWords: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", sifuri: "0", moja: "1", mbili: "2", tatu: "3", nne: "4", tano: "5", sita: "6", saba: "7", nane: "8", tisa: "9" };
  const explicit = prompt.match(/\b(?:trace|copy|write|fuatisha)\s+(?:the\s+)?(?:number|numeral|letter)?\s*([0-9A-Za-z])\b/i)?.[1];
  if (explicit) return explicit;
  const word = prompt.toLocaleLowerCase().match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|sifuri|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa)\b/)?.[1];
  return word ? digitWords[word] : undefined;
}

function activityControlHtml(activity: StructuredPage["activities"][number]) {
  const label = escapeHtmlAttribute(
    activity.prompt.slice(0, 100) || "Learner response",
  );
  const answerAttribute = (index = 0) =>
    activity.correctAnswers?.[index]
      ? ` data-correct-answer="${escapeHtmlAttribute(activity.correctAnswers[index]!)}"`
      : "";
  const feedback = (index = 0) =>
    activity.correctAnswers?.[index]
      ? `<span class="litera-answer-feedback" id="${activity.id}-feedback-${index + 1}" aria-live="polite"></span>`
      : "";
  const numericResponse =
    (activity.correctAnswers?.length && activity.correctAnswers.every((answer) => /^-?\d+(?:[.,]\d+)?$/.test(answer.trim()))) ||
    /\b(?:count|number|numeral|sum|total|how many)\b/i.test(activity.prompt);
  const responseInputMode = numericResponse
    ? "numeric"
    : activity.inputMode ?? "text";
  if (activity.type === "true-false") {
    const expected = activity.correctAnswers?.[0]?.toLocaleLowerCase();
    return `<fieldset class="litera-response litera-response--inline-choice" data-activity-item="${activity.id}"><legend>True or false</legend>${["true", "false"].map((value) => `<label class="litera-choice"><input type="radio" name="${activity.id}" value="${value}"${expected ? ` data-correct-answer="${escapeHtmlAttribute(expected)}" aria-describedby="${activity.id}-feedback-1"` : ""}>${value === "true" ? "True" : "False"}</label>`).join("")}${feedback()}</fieldset>`;
  }
  if (activity.type === "multiple-choice") {
    const expected = activity.correctAnswers?.[0];
    return `<fieldset class="litera-response litera-response--inline-choice" data-activity-item="${activity.id}"><legend>Choose an answer</legend>${(activity.options?.length ? activity.options : ["A", "B", "C", "D"]).map((option) => `<label class="litera-choice"><input type="radio" name="${activity.id}" value="${escapeHtmlAttribute(option)}"${expected ? ` data-correct-answer="${escapeHtmlAttribute(expected)}" aria-describedby="${activity.id}-feedback-1"` : ""}>${escapeHtmlAttribute(option)}</label>`).join("")}${feedback()}</fieldset>`;
  }
  if (activity.type === "matching") {
    const inferredPairs = activity.matchingPairs?.length
      ? activity.matchingPairs
      : activity.options && activity.options.length >= 4
        ? activity.options
            .slice(0, Math.floor(activity.options.length / 2))
            .map((left, index) => ({
              left,
              right:
                activity.options![
                  Math.floor(activity.options!.length / 2) + index
                ] ?? "",
            }))
        : [];
    if (inferredPairs.length) {
      const choices = [...inferredPairs.map((pair) => pair.right)].sort(
        (a, b) => a.localeCompare(b),
      );
      return `<section class="litera-matching-game" data-activity-item="${activity.id}" aria-labelledby="${activity.id}-title"><h3 id="${activity.id}-title">Match each item</h3><p class="sr-only">Drag an item onto its match. Keyboard users can select an item and then select a target.</p><div class="litera-matching-board"><div class="litera-match-bank" aria-label="Items to match">${inferredPairs.map((pair, index) => `<button class="litera-match-card" type="button" draggable="true" data-match-card="${index + 1}" data-correct-answer="${escapeHtmlAttribute(pair.right)}" aria-pressed="false">${escapeHtmlAttribute(pair.left)}</button>`).join("")}</div><div class="litera-match-targets" aria-label="Matching targets">${choices.map((choice) => `<button class="litera-match-target" type="button" data-match-target="${escapeHtmlAttribute(choice)}" aria-label="Match with ${escapeHtmlAttribute(choice)}"><span>${escapeHtmlAttribute(choice)}</span><span class="litera-match-slot" aria-live="polite">Drop here</span></button>`).join("")}</div></div></section>`;
    }
    return `<section class="litera-matching-game" data-activity-item="${activity.id}"><h3>Match each item</h3><label class="litera-response litera-response--stack"><span>Choose or type the matching item</span><input type="text" autocomplete="off" aria-label="${label}"${answerAttribute()} aria-describedby="${activity.id}-feedback-1">${feedback()}</label></section>`;
  }
  if (activity.type === "drawing") {
    const traceTarget = traceTargetFromPrompt(activity.prompt);
    // A drawing canvas can only tell whether *something* was inked, not
    // whether it is correct - it has no idea whether the pupil drew 4 dots
    // or 9. Whenever a numeric answer can be inferred for this activity
    // (e.g. "draw pictures to represent the sum"), add a real gradable
    // numeric field alongside the canvas so the activity is still doable
    // and checkable for anyone who can't use, or doesn't need, freehand
    // drawing - without removing the canvas that keeps the print experience.
    const numericFallback = activity.correctAnswers?.[0]
      ? `<label class="litera-response"><span>Or write the number here instead</span><input type="text" inputmode="numeric" autocomplete="off" aria-label="Number answer: ${label}"${answerAttribute()} aria-describedby="${activity.id}-feedback-1"></label>${feedback()}`
      : "";
    return `<fieldset class="litera-response litera-response--stack" data-activity-item="${activity.id}" style="padding:.65em;border:.12em solid #8a8f98;border-radius:.55em;background:#fff"><legend>${label}</legend><canvas data-litera-trace-canvas${traceTarget ? ` data-trace-target="${escapeHtmlAttribute(traceTarget)}"` : ""} width="900" height="420" role="img" aria-label="${traceTarget ? `Trace ${escapeHtmlAttribute(traceTarget)}` : `Drawing area: ${label}`}" style="display:block;width:100%;height:auto;aspect-ratio:15/7;touch-action:none;border:.1em solid #9ca3af;border-radius:.35em;background:#fff"></canvas><div style="display:flex;gap:.5em;flex-wrap:wrap"><button type="button" data-litera-clear-drawing>Clear drawing</button><button type="button" data-litera-check-drawing>Check drawing</button></div><span data-litera-drawing-feedback role="status" aria-live="polite"></span>${numericFallback}<label><span>Optional description of the drawing</span><textarea placeholder="Describe your drawing if you cannot use the canvas" aria-label="Description: ${label}"></textarea></label></fieldset>`;
  }
  if (activity.type === "fill-blank")
    return `<fieldset class="litera-response-set" style="--answer-count:${activity.answerCount ?? 1}" data-activity-item="${activity.id}"><legend class="sr-only">${label}</legend>${Array.from(
      { length: activity.answerCount ?? 1 },
      (_, index) =>
        `<label class="litera-response" data-activity-item="${activity.id}-${index + 1}"><span class="sr-only">Answer ${index + 1}: ${label}</span><input type="${activity.inputType ?? "text"}" inputmode="${responseInputMode}" autocomplete="off" aria-label="Answer ${index + 1}: ${label}"${answerAttribute(index)} aria-describedby="${activity.id}-feedback-${index + 1}">${feedback(index)}</label>`,
    ).join("")}</fieldset>`;
  if (activity.multiline)
    return `<label class="litera-response litera-response--stack" data-activity-item="${activity.id}"><span class="sr-only">Your response: ${label}</span><textarea aria-label="${label}"></textarea></label>`;
  // responsePresentation() also computes answerCount > 1 for short-answer
  // prompts like "write the following numbers: two, four, seven, nine" -
  // only the fill-blank branch above ever honoured that count; every other
  // type silently rendered one input regardless, losing every blank past
  // the first.
  if ((activity.answerCount ?? 1) > 1)
    return `<fieldset class="litera-response-set" style="--answer-count:${activity.answerCount}" data-activity-item="${activity.id}"><legend class="sr-only">${label}</legend>${Array.from(
      { length: activity.answerCount! },
      (_, index) =>
        `<label class="litera-response" data-activity-item="${activity.id}-${index + 1}"><span class="sr-only">Answer ${index + 1}: ${label}</span><input type="${activity.inputType ?? "text"}" inputmode="${responseInputMode}" autocomplete="off" aria-label="Answer ${index + 1}: ${label}"${answerAttribute(index)} aria-describedby="${activity.id}-feedback-${index + 1}">${feedback(index)}</label>`,
    ).join("")}</fieldset>`;
  return `<label class="litera-response" data-activity-item="${activity.id}"><span class="sr-only">Your answer: ${label}</span><input type="${activity.inputType ?? "text"}" inputmode="${responseInputMode}" autocomplete="off" aria-label="${label}"${answerAttribute()} aria-describedby="${activity.id}-feedback-1">${feedback()}</label>`;
}

function answerFeedbackRuntime() {
  return `<script data-litera-answer-feedback>(function(){var submit=document.querySelector('[data-litera-submit]');var controls=Array.from(document.querySelectorAll('.litera-response input:not([type=hidden]),.litera-response select,.litera-response textarea,.source-answer-line input,.dense-question input,.litera-matching-grid select'));var answered=function(control){if(control.type==='radio'||control.type==='checkbox')return control.checked;return Boolean(control.value&&control.value.trim())};var update=function(){if(submit)submit.disabled=!controls.some(answered)};document.addEventListener('input',function(event){var input=event.target;if(!((input instanceof HTMLInputElement)||(input instanceof HTMLSelectElement)||(input instanceof HTMLTextAreaElement)))return;delete input.dataset.answerState;input.removeAttribute('aria-invalid');update()});document.addEventListener('change',update);if(submit)submit.addEventListener('click',function(){var clean=function(value){return value.normalize('NFKC').toLocaleLowerCase().replace(/[ ,]/g,'').trim()};var correctCount=0,checkedCount=0;controls.forEach(function(input){if(!answered(input)||!input.dataset.correctAnswer)return;checkedCount++;var correct=clean(input.value)===clean(input.dataset.correctAnswer);if(correct)correctCount++;input.dataset.answerState=correct?'correct':'incorrect';input.setAttribute('aria-invalid',String(!correct));var feedback=document.getElementById(input.getAttribute('aria-describedby')||'');if(feedback){feedback.dataset.state=correct?'correct':'incorrect';feedback.textContent=correct?'Correct - well done!':'Not correct yet - try again.'}});parent.postMessage({type:'litera-answer-feedback',correct:correctCount,incorrect:checkedCount-correctCount,checked:checkedCount},'*')});update();document.querySelectorAll('[data-litera-drawing-canvas]').forEach(function(canvas){var context=canvas.getContext('2d');if(!context)return;context.lineWidth=5;context.lineCap='round';context.strokeStyle='#172554';var drawing=false;var point=function(event){var rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}};canvas.addEventListener('pointerdown',function(event){drawing=true;canvas.setPointerCapture(event.pointerId);var p=point(event);context.beginPath();context.moveTo(p.x,p.y)});canvas.addEventListener('pointermove',function(event){if(!drawing)return;var p=point(event);context.lineTo(p.x,p.y);context.stroke()});canvas.addEventListener('pointerup',function(){drawing=false});canvas.addEventListener('pointercancel',function(){drawing=false});var clear=canvas.parentElement&&canvas.parentElement.querySelector('[data-litera-clear-drawing]');if(clear)clear.addEventListener('click',function(){context.clearRect(0,0,canvas.width,canvas.height)})})})()</script>${traceCanvasRuntime()}${matchingGameRuntime()}`;
}

function matchingGameRuntime() {
  return `<script data-litera-matching-runtime>(function(){document.querySelectorAll('.litera-matching-game').forEach(function(game){var selected=null,cards=Array.from(game.querySelectorAll('.litera-match-card')),targets=Array.from(game.querySelectorAll('.litera-match-target'));var choose=function(card){selected=card;cards.forEach(function(item){item.setAttribute('aria-pressed',String(item===card))})};var place=function(card,target){if(!card||!target)return;var expected=(card.dataset.correctAnswer||'').normalize('NFKC').toLocaleLowerCase().trim(),actual=(target.dataset.matchTarget||'').normalize('NFKC').toLocaleLowerCase().trim(),correct=expected===actual;target.dataset.answerState=correct?'correct':'incorrect';target.querySelector('.litera-match-slot').textContent=card.textContent||'Matched';card.hidden=correct;if(correct)selected=null;cards.forEach(function(item){item.setAttribute('aria-pressed',String(item===selected))});window.parent.postMessage({type:'litera-answer-feedback',correct:correct?1:0,incorrect:correct?0:1,checked:1},'*')};cards.forEach(function(card){card.addEventListener('dragstart',function(event){choose(card);event.dataTransfer&&event.dataTransfer.setData('text/plain',card.dataset.matchCard||'')});card.addEventListener('click',function(){choose(card)})});targets.forEach(function(target){target.addEventListener('dragover',function(event){event.preventDefault()});target.addEventListener('drop',function(event){event.preventDefault();place(selected,target)});target.addEventListener('click',function(){place(selected,target)})})})})()</script>`;
}

function traceCanvasRuntime() {
  return `<script data-litera-trace-runtime>(function(){document.querySelectorAll('[data-litera-trace-canvas]').forEach(function(canvas){var context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;var ink=document.createElement('canvas'),target=document.createElement('canvas');ink.width=target.width=canvas.width;ink.height=target.height=canvas.height;var inkContext=ink.getContext('2d',{willReadFrequently:true}),targetContext=target.getContext('2d',{willReadFrequently:true});if(!inkContext||!targetContext)return;var symbol=canvas.dataset.traceTarget||'';var drawTemplate=function(ctx){if(!symbol)return;ctx.save();ctx.strokeStyle='rgba(37,99,235,.42)';ctx.lineWidth=6;ctx.setLineDash([10,12]);ctx.font='bold 300px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText(symbol,canvas.width/2,canvas.height/2);ctx.restore()};drawTemplate(context);drawTemplate(targetContext);context.lineWidth=inkContext.lineWidth=12;context.lineCap=inkContext.lineCap='round';context.lineJoin=inkContext.lineJoin='round';context.strokeStyle='#172554';inkContext.strokeStyle='#172554';var drawing=false,point=function(event){var rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}};canvas.addEventListener('pointerdown',function(event){drawing=true;canvas.setPointerCapture(event.pointerId);var p=point(event);context.beginPath();inkContext.beginPath();context.moveTo(p.x,p.y);inkContext.moveTo(p.x,p.y)});canvas.addEventListener('pointermove',function(event){if(!drawing)return;var p=point(event);context.lineTo(p.x,p.y);inkContext.lineTo(p.x,p.y);context.stroke();inkContext.stroke()});canvas.addEventListener('pointerup',function(){drawing=false});canvas.addEventListener('pointercancel',function(){drawing=false});var parent=canvas.closest('[data-activity-item]'),feedback=parent&&parent.querySelector('[data-litera-drawing-feedback]'),clear=parent&&parent.querySelector('[data-litera-clear-drawing]'),check=parent&&parent.querySelector('[data-litera-check-drawing]');if(clear)clear.addEventListener('click',function(){context.clearRect(0,0,canvas.width,canvas.height);inkContext.clearRect(0,0,ink.width,ink.height);drawTemplate(context);if(feedback)feedback.textContent=''});if(check)check.addEventListener('click',function(){var learner=inkContext.getImageData(0,0,ink.width,ink.height).data;if(!symbol){var marks=0;for(var i=3;i<learner.length;i+=4)if(learner[i]>40)marks++;var done=marks>250;if(feedback)feedback.textContent=done?'Drawing recorded.':'Draw in the canvas before checking.';return}var guide=targetContext.getImageData(0,0,target.width,target.height).data,coverage=0,guideCount=0,precision=0,inkCount=0,radius=10,w=canvas.width,h=canvas.height,near=function(data,x,y){for(var yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy+=2)for(var xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx+=2)if(data[(yy*w+xx)*4+3]>40)return true;return false};for(var y=0;y<h;y+=3)for(var x=0;x<w;x+=3){var offset=(y*w+x)*4;if(guide[offset+3]>40){guideCount++;if(near(learner,x,y))coverage++}if(learner[offset+3]>40){inkCount++;if(near(guide,x,y))precision++}}var score=.72*(coverage/Math.max(1,guideCount))+.28*(precision/Math.max(1,inkCount)),correct=score>=.56;if(feedback){feedback.dataset.state=correct?'correct':'incorrect';feedback.textContent=correct?'Good tracing - your line closely follows the guide.':'Keep trying - follow the dotted guide more closely.'}parent&&parent.setAttribute('data-answer-state',correct?'correct':'incorrect');parent&&parent.postMessage;window.parent.postMessage({type:'litera-answer-feedback',correct:correct?1:0,incorrect:correct?0:1,checked:1,score:Math.round(score*100)},'*')})})})()</script>`;
}

function localizedAnswerSubmitLabel(text: string) {
  if (/\b(?:answer|question|exercise|activity|draw|write|match|count|fill|select|choose)\b/i.test(text)) return "Submit answers";
  if (/\b(?:andika|jibu|swali|sehemu|kivuli|zoezi|shughuli)\b/i.test(text)) return "Wasilisha majibu";
  if (/\b(?:réponse|question|exercice)\b/i.test(text)) return "Soumettre les réponses";
  if (/\b(?:respuesta|pregunta|ejercicio)\b/i.test(text)) return "Enviar respuestas";
  if (/\b(?:antwort|frage|übung)\b/i.test(text)) return "Antworten senden";
  if (/\b(?:resposta|pergunta|exercício)\b/i.test(text)) return "Enviar respostas";
  return "Submit answers";
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function storyboardContentTree(page: StructuredPage) {
  const activityByText = new Map(
    page.activities.map((activity) => [
      normalizeSemanticText(activity.prompt),
      activity,
    ]),
  );
  const nodes: Array<{
    id: string;
    role: string;
    text: string;
    level?: number;
  }> = page.sections.map((section) => {
    const activity = activityByText.get(normalizeSemanticText(section.text));
    return activity
      ? {
          id: activity.id,
          role: `activity-${activity.type}`,
          text: section.text,
          level: section.level,
        }
      : {
          id: section.id,
          role: section.kind,
          text: section.text,
          level: section.level,
        };
  });
  const represented = new Set(
    nodes.map((node) => normalizeSemanticText(node.text)),
  );
  for (const activity of page.activities) {
    if (represented.has(normalizeSemanticText(activity.prompt))) continue;
    nodes.push({
      id: activity.id,
      role: `activity-${activity.type}`,
      text: activity.prompt,
      level: undefined,
    });
  }
  return nodes;
}

function storyboardSemanticTreePasses(
  html: string,
  nodes: ReturnType<typeof storyboardContentTree>,
) {
  for (const node of nodes) {
    const id = escapeRegExp(node.id);
    const matches = [
      ...html.matchAll(
        new RegExp(
          `<([a-z][\\w:-]*)\\b(?=[^>]*\\bdata-id=["']${id}["'])[^>]*>([^<]*)<\\/\\1>`,
          "gi",
        ),
      ),
    ];
    if (matches.length !== 1) return false;
    if (
      normalizeSemanticText(decodeHtmlText(matches[0]?.[2] ?? "")) !==
      normalizeSemanticText(node.text)
    )
      return false;
  }
  return true;
}

function normalizeSemanticText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
/** MuPDF's own word-boundary heuristic (used by both toStructuredText's
 * per-character walk and asText()) infers spaces from horizontal glyph-advance
 * gaps, since a PDF content stream doesn't reliably encode a literal space
 * between every glyph. A "fi" ligature glyph's advance width doesn't match
 * the sum of drawing "f" and "i" separately, so that heuristic misreads the
 * transition from the ligature to the next glyph as a word gap and injects a
 * spurious space right there - "five" extracts as "fi ve", "fingers" as
 * "fi ngers", "figures" as "fi gures", on every page, for every word
 * containing that ligature. This runs at the extraction boundary (applied to
 * both the whole-page text and each individual line) so every downstream
 * consumer (structuring, activity detection, rendering, TTS) sees the
 * correct word instead of each needing its own workaround. NFKC first also
 * collapses the actual ligature codepoints (ﬁ ﬀ ﬂ etc.) should they ever
 * appear literally instead of as pre-split ASCII + injected space. "fi" is
 * not a standalone English word, so collapsing the gap whenever it's
 * immediately followed by more letters is safe.
 */
function normalizeExtractedText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\b(f[fil])\s+(?=[a-zA-Z])/gi, "$1");
}
function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBookStyleguide(
  fontFamily: string | undefined,
  decoration: GeometryPageOptions["decoration"],
) {
  return [
    `Typography: use ${fontFamily || "the source PDF font family"} consistently. Map page/chapter titles to h1, section headings to h2, callout headings to h3, and running text to paragraphs. Never choose heading levels from position alone.`,
    `Book palette: ${(decoration.bookPalette ?? [decoration.accent]).join(", ")}. This page's nearest source accent is ${decoration.accent}; sampled page-gradient stops ${(decoration.gradientStops ?? [decoration.top, decoration.bottom]).join(" → ")} at ${decoration.gradientAngle ?? 180} degrees. Use the page accent for local identity but choose all other colours only from the book palette so adjacent pages remain consistent.`,
    "Backgrounds: textbook surfaces are commonly borderless layered gradients, not flat boxed fills. Recreate visible page washes, bands, cards, and callouts with subtle linear or radial gradients derived from the sampled palette. Never invent outlines, divider rules, underlines, or rectangle borders when they are absent from the source. Use a flat fill only when the source is visibly flat.",
    "Layout: preserve source alignment, column relationships, whitespace, border radii, side bands, cards, and page furniture with HTML/CSS. Text panels and exercises are never raster images.",
    "Images: only referenced photographs, illustrations, diagrams, signatures, seals, and decorative artwork may use img. Keep intrinsic aspect ratio and source-relative scale.",
    "Accessibility: maintain DOM reading order, sequential headings, semantic tables, labelled form controls for activities, figures with captions, and WCAG-readable contrast. Body text and labels need at least 4.5:1 contrast; large headings need at least 3:1. Use the darkest palette shade on light gradients and white on dark gradients. Never place pale grey or low-opacity text on a pale wash.",
  ].join("\n");
}

async function derivePublicationPalette(
  book: DeviceBook,
  pages: StructuredPage[],
  signal?: AbortSignal,
) {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const indexes = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const ratio of [0.25, 0.5, 0.75, 1])
    indexes.add(
      Math.max(
        0,
        Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio)),
      ),
    );
  const accents: string[] = [];
  for (const index of indexes) {
    signal?.throwIfAborted();
    const source = ordered[index];
    const extracted =
      source &&
      book.extractedPages?.find((page) => page.number === source.pageNumber);
    if (!extracted) continue;
    const image = await readablePageImage(book, extracted);
    accents.push((await samplePageDecoration(image)).accent);
  }
  const clusters: Array<{ colors: string[]; count: number }> = [];
  for (const color of accents.filter((value) =>
    /^#[0-9a-f]{6}$/i.test(value),
  )) {
    const cluster = clusters.find(
      (candidate) => colorDistance(candidate.colors[0]!, color) < 72,
    );
    if (cluster) {
      cluster.colors.push(color);
      cluster.count += 1;
    } else clusters.push({ colors: [color], count: 1 });
  }
  const palette = clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((cluster) => representativeHex(cluster.colors));
  return palette.length ? palette : ["#176b3a"];
}

function harmonizePageDecoration(
  decoration: PageDecoration,
  palette: string[],
): PageDecoration {
  return {
    ...decoration,
    bookPalette: [...new Set([decoration.accent, ...palette])],
  };
}

function hexRgb(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}
function colorDistance(a: string, b: string) {
  const left = hexRgb(a);
  const right = hexRgb(b);
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
function representativeHex(colors: string[]) {
  return colors.reduce((best, candidate) => {
    const distance = colors.reduce(
      (sum, color) => sum + colorDistance(candidate, color),
      0,
    );
    const bestDistance = colors.reduce(
      (sum, color) => sum + colorDistance(best, color),
      0,
    );
    return distance < bestDistance ? candidate : best;
  }, colors[0] ?? "#176b3a");
}

async function samplePageDecoration(source: Blob) {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 88;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      return {
        top: "#f4f7f3",
        bottom: "#f4f7f3",
        accent: "#176b3a",
        gradientStops: ["#f4f7f3", "#ffffff", "#f4f7f3"],
        gradientAngle: 180,
        suppressTopStrip: false,
      };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const collect = (
      fromY: number,
      toY: number,
      predicate: (r: number, g: number, b: number) => boolean,
    ) => {
      const colors: Array<[number, number, number]> = [];
      for (let y = fromY; y < toY; y += 1)
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = pixels[offset] ?? 255;
          const g = pixels[offset + 1] ?? 255;
          const b = pixels[offset + 2] ?? 255;
          if (predicate(r, g, b)) colors.push([r, g, b]);
        }
      if (!colors.length) return undefined;
      const totals = colors.reduce(
        (sum, color) =>
          [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]] as [
            number,
            number,
            number,
          ],
        [0, 0, 0],
      );
      return rgbHex(
        totals.map((value) => Math.round(value / colors.length)) as [
          number,
          number,
          number,
        ],
      );
    };
    const light = (r: number, g: number, b: number) => (r + g + b) / 3 > 165;
    const colored = (r: number, g: number, b: number) =>
      Math.max(r, g, b) - Math.min(r, g, b) > 28 &&
      (r + g + b) / 3 > 30 &&
      (r + g + b) / 3 < 220;
    const clusters = new Map<
      string,
      {
        count: number;
        total: [number, number, number];
        rows: Map<number, Set<number>>;
        columns: Map<number, Set<number>>;
      }
    >();
    for (let y = 0; y < canvas.height; y += 1)
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const r = pixels[offset] ?? 255;
        const g = pixels[offset + 1] ?? 255;
        const b = pixels[offset + 2] ?? 255;
        if (!colored(r, g, b)) continue;
        const key = `${Math.round(r / 48)}:${Math.round(g / 48)}:${Math.round(b / 48)}`;
        const cluster = clusters.get(key) ?? {
          count: 0,
          total: [0, 0, 0],
          rows: new Map<number, Set<number>>(),
          columns: new Map<number, Set<number>>(),
        };
        cluster.count += 1;
        cluster.total = [
          cluster.total[0] + r,
          cluster.total[1] + g,
          cluster.total[2] + b,
        ];
        const row = cluster.rows.get(y) ?? new Set<number>();
        row.add(x);
        cluster.rows.set(y, row);
        const column = cluster.columns.get(x) ?? new Set<number>();
        column.add(y);
        cluster.columns.set(x, column);
        clusters.set(key, cluster);
      }
    const accentScore = (cluster: {
      count: number;
      total: [number, number, number];
      rows: Map<number, Set<number>>;
      columns: Map<number, Set<number>>;
    }) => {
      const average = cluster.total.map(
        (value) => value / Math.max(1, cluster.count),
      );
      const chroma = Math.max(...average) - Math.min(...average);
      const luminance = average.reduce((sum, value) => sum + value, 0) / 3;
      const longestContiguousRun = (values: Set<number>) => {
        const ordered = [...values].sort((a, b) => a - b);
        let longest = 0;
        let current = 0;
        let previous = Number.NEGATIVE_INFINITY;
        ordered.forEach((value) => {
          current = value <= previous + 1 ? current + 1 : 1;
          longest = Math.max(longest, current);
          previous = value;
        });
        return longest;
      };
      const longestHorizontalRule = Math.max(
        0,
        ...[...cluster.rows.values()].map(longestContiguousRun),
      );
      const longestVerticalRule = Math.max(
        0,
        ...[...cluster.columns.values()].map(longestContiguousRun),
      );
      // Rules, table borders, and heading pills form long single-colour runs;
      // illustrations form compact blobs. This structural continuity keeps a
      // large orange fruit from replacing the book's thin teal chrome.
      const structuralContinuity = Math.max(
        1,
        longestHorizontalRule * longestHorizontalRule,
        longestVerticalRule * longestVerticalRule,
      );
      // Pale page washes cover more pixels than a heading pill or border, but
      // they are not the page's accent. Weight saturation and distance from
      // white strongly enough for the smaller, intentional source colour to
      // win without hard-coding a particular textbook palette.
      return (
        Math.sqrt(cluster.count) * structuralContinuity *
        Math.pow(Math.max(1, chroma), 2) *
        Math.max(0.35, (255 - luminance) / 90)
      );
    };
    const dominant = [...clusters.values()].sort(
      (a, b) => accentScore(b) - accentScore(a),
    )[0];
    const accent = dominant
      ? rgbHex(
          dominant.total.map((value) => Math.round(value / dominant.count)) as [
            number,
            number,
            number,
          ],
        )
      : "#176b3a";
    let strongestTransitions = 0;
    let strongestControlPixels = 0;
    for (let y = 0; y < Math.min(12, canvas.height); y += 1) {
      let transitions = 0;
      let previousBucket = "";
      let controlPixels = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const r = pixels[offset] ?? 255;
        const g = pixels[offset + 1] ?? 255;
        const b = pixels[offset + 2] ?? 255;
        const bucket = `${Math.round(r / 48)}:${Math.round(g / 48)}:${Math.round(b / 48)}`;
        if (previousBucket && bucket !== previousBucket) transitions += 1;
        previousBucket = bucket;
        if ((r + g + b) / 3 < 100 || Math.max(r, g, b) - Math.min(r, g, b) > 70)
          controlPixels += 1;
      }
      if (transitions > strongestTransitions) {
        strongestTransitions = transitions;
        strongestControlPixels = controlPixels;
      }
    }
    const top = collect(0, 14, light) ?? "#f4f7f3";
    const bottom = collect(74, 88, light) ?? "#f4f7f3";
    const gradientStops = [0.03, 0.25, 0.5, 0.75, 0.97].map((position) =>
      sampleBackgroundBand(pixels, canvas.width, canvas.height, position),
    );
    gradientStops[0] = top;
    gradientStops[gradientStops.length - 1] = bottom;
    return {
      top,
      bottom,
      accent,
      gradientStops,
      gradientAngle: 180,
      suppressTopStrip:
        strongestTransitions >= 10 && strongestControlPixels >= 10,
    };
  } finally {
    bitmap.close();
  }
}
function rgbHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}
function sampleBackgroundBand(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  position: number,
) {
  const centerY = Math.max(
    0,
    Math.min(height - 1, Math.round((height - 1) * position)),
  );
  const colors: Array<[number, number, number]> = [];
  for (
    let y = Math.max(0, centerY - 3);
    y <= Math.min(height - 1, centerY + 3);
    y += 1
  )
    for (let x = 0; x < width; x += 1) {
      if (x > width * 0.22 && x < width * 0.78) continue;
      const offset = (y * width + x) * 4;
      const r = pixels[offset] ?? 255;
      const g = pixels[offset + 1] ?? 255;
      const b = pixels[offset + 2] ?? 255;
      if ((r + g + b) / 3 < 115) continue;
      colors.push([r, g, b]);
    }
  if (!colors.length) return "#ffffff";
  const middle = colors.sort(
    (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]),
  )[Math.floor(colors.length / 2)]!;
  return rgbHex(middle);
}

async function ensurePageGeometry(
  book: DeviceBook,
  page: NonNullable<DeviceBook["extractedPages"]>[number],
) {
  if (book.sourceFormat !== "pdf") return page;
  const { default: mupdf } = await import("mupdf");
  let document;
  try {
    document = mupdf.Document.openDocument(
      await durableSourceBytes(book),
      "application/pdf",
    );
  } catch {
    return fallbackPageGeometry(page);
  }
  let sourcePage;
  try {
    sourcePage = document.loadPage(page.number - 1);
  } catch {
    document.destroy();
    return fallbackPageGeometry(page);
  }
  if ((page.layoutBlocks?.length ?? 0) > 2) {
    const bounds = sourcePage.getBounds();
    const vectorRules = extractVectorRuleBlocks(sourcePage, mupdf);
    sourcePage.destroy();
    document.destroy();
    return {
      ...page,
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
      layoutBlocks: mergeLayoutGeometry(page.layoutBlocks ?? [], vectorRules),
    };
  }
  let textLayer;
  try {
    textLayer = sourcePage.toStructuredText("preserve-images,preserve-spans");
  } catch {
    sourcePage.destroy();
    document.destroy();
    return fallbackPageGeometry(page);
  }
  const bounds = sourcePage.getBounds();
  const layoutBlocks: ExtractedLayoutBlock[] = [];
  let line: ExtractedLayoutBlock | undefined;
  let lineFonts = new Map<
    string,
    { count: number; value: NonNullable<ExtractedLayoutBlock["font"]> }
  >();
  textLayer.walk({
    beginLine(rect) {
      lineFonts = new Map();
      line = {
        type: "text",
        bbox: {
          x: rect[0],
          y: rect[1],
          w: rect[2] - rect[0],
          h: rect[3] - rect[1],
        },
        text: "",
      };
    },
    onChar(character, _origin, font, size, _quad, color) {
      if (!line) return;
      line.text += character;
      const value = {
        name: font.getName(),
        family: font.getName(),
        weight: font.isBold() ? "bold" : "normal",
        style: font.isItalic() ? "italic" : "normal",
        size,
        color: mupdfColor(color),
      };
      const key = `${value.family}|${value.weight}|${value.style}|${Math.round(size * 10)}|${value.color}`;
      const current = lineFonts.get(key);
      lineFonts.set(key, {
        count: (current?.count ?? 0) + Math.max(1, character.length),
        value,
      });
    },
    endLine() {
      if (line?.text?.trim()) {
        line.font = [...lineFonts.values()].sort(
          (a, b) => b.count - a.count,
        )[0]?.value;
        layoutBlocks.push({
          ...line,
          text: normalizeExtractedText(line.text).replace(/\s+/g, " ").trim(),
        });
      }
      line = undefined;
    },
    onImageBlock(rect) {
      layoutBlocks.push({
        type: "image",
        bbox: {
          x: rect[0],
          y: rect[1],
          w: rect[2] - rect[0],
          h: rect[3] - rect[1],
        },
      });
    },
  });
  layoutBlocks.push(...extractVectorRuleBlocks(sourcePage, mupdf));
  textLayer.destroy();
  sourcePage.destroy();
  document.destroy();
  return {
    ...page,
    width: bounds[2] - bounds[0],
    height: bounds[3] - bounds[1],
    layoutBlocks,
  };
}

function extractVectorRuleBlocks(
  sourcePage: {
    run: (
      device: InstanceType<typeof import("mupdf").default.Device>,
      matrix: import("mupdf").Matrix,
    ) => void;
  },
  mupdf: typeof import("mupdf").default,
) {
  const rules: ExtractedLayoutBlock[] = [];
  const transformPoint = (
    x: number,
    y: number,
    matrix: import("mupdf").Matrix,
  ) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  });
  const device = new mupdf.Device({
    strokePath(path, stroke, matrix) {
      capturePath(path, matrix, Math.max(0.65, stroke.getLineWidth()), true);
    },
    fillPath(path, _evenOdd, matrix) {
      // Filled vector illustrations (for example outlined stars in counting
      // exercises) are not exposed as PDF image blocks. Inspect their closed
      // geometry too; capturePath only promotes the narrowly recognised
      // ellipse/star signatures, so ordinary decorative fills remain ignored.
      capturePath(path, matrix, 0.7, true);
    },
  });
  function capturePath(
    path: import("mupdf").Path,
    matrix: import("mupdf").Matrix,
    thickness: number,
    detectCurves: boolean,
  ) {
    let cursor: { x: number; y: number } | undefined;
    const curvePoints: Array<{ x: number; y: number }> = [];
    const pathPoints: Array<{ x: number; y: number }> = [];
    let curveCount = 0;
    let lineCount = 0;
    const addSegment = (x: number, y: number) => {
      const next = transformPoint(x, y, matrix);
      pathPoints.push(next);
      if (cursor) {
        lineCount += 1;
        const horizontal = Math.abs(next.y - cursor.y) <= 0.8;
        const vertical = Math.abs(next.x - cursor.x) <= 0.8;
        const length = Math.hypot(next.x - cursor.x, next.y - cursor.y);
        if ((horizontal || vertical) && length >= 3) {
          rules.push({
            type: "image",
            bbox: {
              x: Math.min(cursor.x, next.x),
              y: Math.min(cursor.y, next.y),
              w: horizontal ? Math.abs(next.x - cursor.x) : thickness,
              h: vertical ? Math.abs(next.y - cursor.y) : thickness,
            },
          });
        }
      }
      cursor = next;
    };
    path.walk({
      moveTo(x, y) {
        cursor = transformPoint(x, y, matrix);
        pathPoints.push(cursor);
      },
      lineTo: addSegment,
      curveTo(x1, y1, x2, y2, x3, y3) {
        if (detectCurves) {
          curveCount += 1;
          curvePoints.push(
            transformPoint(x1, y1, matrix),
            transformPoint(x2, y2, matrix),
            transformPoint(x3, y3, matrix),
          );
        }
        cursor = transformPoint(x3, y3, matrix);
      },
      closePath() {
        cursor = undefined;
      },
    });
    if (detectCurves && curveCount >= 4 && curveCount <= 8 && curvePoints.length) {
      const xs = curvePoints.map((point) => point.x);
      const ys = curvePoints.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      const ratio = w / Math.max(1, h);
      if (w >= 20 && h >= 16 && ratio >= .55 && ratio <= 3.8)
        rules.push({ type: "image", shape: "ellipse", bbox: { x, y, w, h } });
    }
    if (detectCurves && curveCount === 0 && lineCount >= 9 && lineCount <= 28 && pathPoints.length) {
      const xs = pathPoints.map((point) => point.x);
      const ys = pathPoints.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      const ratio = w / Math.max(1, h);
      if (w >= 16 && h >= 16 && ratio >= .65 && ratio <= 1.5)
        rules.push({ type: "image", shape: "star", bbox: { x, y, w, h } });
    }
  }
  sourcePage.run(device, mupdf.Matrix.identity);
  device.close();
  device.destroy();
  return mergeLayoutGeometry([], rules);
}

function mergeLayoutGeometry(
  blocks: ExtractedLayoutBlock[],
  additions: ExtractedLayoutBlock[],
) {
  const merged = [...blocks];
  for (const block of additions) {
    const duplicate = merged.some(
      (candidate) =>
        candidate.type === block.type &&
        Math.abs(candidate.bbox.x - block.bbox.x) < 0.8 &&
        Math.abs(candidate.bbox.y - block.bbox.y) < 0.8 &&
        Math.abs(candidate.bbox.w - block.bbox.w) < 0.8 &&
        Math.abs(candidate.bbox.h - block.bbox.h) < 0.8,
    );
    if (!duplicate) merged.push(block);
  }
  return merged;
}

function fallbackPageGeometry(
  page: NonNullable<DeviceBook["extractedPages"]>[number],
) {
  const width = page.width ?? 612;
  const height = page.height ?? 792;
  const rawLines = (page.text ?? "")
    .split(/\r?\n/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const lines = rawLines.length
    ? rawLines
    : [
        "Page content could not be recovered. Re-run Extraction to rebuild this page.",
      ];
  const marginX = width * 0.08;
  const top = height * 0.07;
  const available = height * 0.86;
  const lineHeight = Math.max(
    8,
    Math.min(16, available / Math.max(1, lines.length)),
  );
  const layoutBlocks: ExtractedLayoutBlock[] = lines.map((text, index) => ({
    type: "text",
    text,
    bbox: {
      x: marginX,
      y: top + index * lineHeight,
      w: width - marginX * 2,
      h: lineHeight,
    },
    font: {
      family: "Arial",
      name: "Arial",
      size: Math.max(7, lineHeight * 0.76),
      weight: index === 0 && lines.length < 12 ? "bold" : "normal",
      style: "normal",
      color: "#171717",
    },
  }));
  return { ...page, width, height, layoutBlocks };
}

function persistentImageUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        reader.error ??
          new Error("An extracted page image could not be restored."),
      );
    reader.readAsDataURL(blob);
  });
}

async function materializeSourceCrops(
  html: string,
  source: Blob,
  sourceWidth: number,
  sourceHeight: number,
  layoutBlocks: ExtractedLayoutBlock[],
) {
  const matches = [...html.matchAll(/<img\b[^>]*>/gi)].filter(
    (match) =>
      /\bsrc\s*=\s*(["'])litera-source:\/\/page\1/i.test(match[0]) &&
      /\bdata-source-crop\s*=\s*(["'])[^"']+\1/i.test(match[0]),
  );
  if (!matches.length) return html;
  const bitmap = await createImageBitmap(source);
  try {
    let output = html;
    for (const match of matches) {
      const cropValue = match[0].match(
        /\bdata-source-crop\s*=\s*(["'])([^"']+)\1/i,
      )?.[2];
      const values = (cropValue ?? "").split(/[,\s]+/).map(Number);
      if (
        values.length !== 4 ||
        values.some((value) => !Number.isFinite(value))
      )
        continue;
      const [x, y, width, height] = values as [number, number, number, number];
      const requested = { x, y, w: width, h: height };
      const obscuredText = layoutBlocks.some(
        (block) =>
          block.type === "text" &&
          block.text?.trim() &&
          cropObscuresText(requested, block.bbox),
      );
      if (obscuredText) {
        output = output.replace(match[0], "");
        continue;
      }
      const scaleX = bitmap.width / Math.max(1, sourceWidth);
      const scaleY = bitmap.height / Math.max(1, sourceHeight);
      const sx = Math.max(0, Math.round(x * scaleX));
      const sy = Math.max(0, Math.round(y * scaleY));
      const sw = Math.max(
        1,
        Math.min(bitmap.width - sx, Math.round(width * scaleX)),
      );
      const sh = Math.max(
        1,
        Math.min(bitmap.height - sy, Math.round(height * scaleY)),
      );
      const rough = document.createElement("canvas");
      rough.width = sw;
      rough.height = sh;
      const roughContext = rough.getContext("2d", { willReadFrequently: true });
      if (!roughContext) continue;
      roughContext.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      const trim = visiblePixelBounds(
        roughContext.getImageData(0, 0, sw, sh),
        sw,
        sh,
      );
      const padding = Math.max(2, Math.round(Math.min(sw, sh) * 0.012));
      const tx = Math.max(0, (trim?.x ?? 0) - padding);
      const ty = Math.max(0, (trim?.y ?? 0) - padding);
      const tw = Math.min(sw - tx, (trim?.w ?? sw) + padding * 2);
      const th = Math.min(sh - ty, (trim?.h ?? sh) + padding * 2);
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      canvas
        .getContext("2d")
        ?.drawImage(bitmap, sx + tx, sy + ty, tw, th, 0, 0, tw, th);
      const crop = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.95),
      );
      if (!crop) continue;
      const url = await persistentImageUrl(crop);
      const hydratedTag = match[0]
        .replace(/litera-source:\/\/page/i, url)
        .replace(/\s+data-source-crop\s*=\s*(["'])[^"']*\1/i, "");
      output = output.replace(match[0], hydratedTag);
    }
    return output;
  } finally {
    bitmap.close();
  }
}

function cropObscuresText(
  crop: { x: number; y: number; w: number; h: number },
  text: { x: number; y: number; w: number; h: number },
) {
  const overlapWidth = Math.max(
    0,
    Math.min(crop.x + crop.w, text.x + text.w) - Math.max(crop.x, text.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(crop.y + crop.h, text.y + text.h) - Math.max(crop.y, text.y),
  );
  return (overlapWidth * overlapHeight) / Math.max(1, text.w * text.h) > 0.12;
}

function visiblePixelBounds(image: ImageData, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = image.data[offset] ?? 255;
      const g = image.data[offset + 1] ?? 255;
      const b = image.data[offset + 2] ?? 255;
      const alpha = image.data[offset + 3] ?? 255;
      const brightness = (r + g + b) / 3;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (alpha < 12 || (brightness > 246 && saturation < 9)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return maxX < minX || maxY < minY
    ? undefined
    : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function storyboardHtmlPassesFidelityGate(
  html: string,
  page: NonNullable<DeviceBook["extractedPages"]>[number],
  semanticBlockCount?: number,
  decoration?: PageDecoration,
) {
  if (/litera-(?:asset|source):\/\//i.test(html)) return false;
  if (!/<main\b[^>]*data-litera-page/i.test(html)) return false;
  if (isStoryboardNoise(html.replace(/<[^>]+>/g, " "))) return false;
  if (
    decoration &&
    !storyboardPaletteIsSafe(html, [
      ...(decoration.bookPalette ?? []),
      decoration.accent,
      ...(decoration.gradientStops ?? []),
      decoration.top,
      decoration.bottom,
    ])
  )
    return false;
  const sourceLightTextBlocks =
    page.layoutBlocks?.filter(
      (block) =>
        block.type === "text" &&
        block.text?.trim() &&
        isLightSourceText(block.font?.color),
    ).length ?? 0;
  // Multiple light labels are strong evidence of opaque coloured source
  // panels. The geometry renderer binds each label to its sampled-accent
  // surface; a model-generated shared CSS rule cannot be contrast-audited.
  if (sourceLightTextBlocks >= 2) return false;
  const sourceTextBlocks =
    page.layoutBlocks?.filter(
      (block) => block.type === "text" && block.text?.trim(),
    ) ?? [];
  const textBearingPanels =
    page.layoutBlocks?.filter(
      (block) =>
        block.type === "image" &&
        block.bbox.w > block.bbox.h * 2 &&
        sourceTextBlocks.some((text) =>
          cropObscuresText(block.bbox, text.bbox),
        ),
    ).length ?? 0;
  // Wide raster regions beneath selectable text are banners, activity bars,
  // or panel furniture. Their colours are reconstructed deterministically so
  // a model cannot wash them out or turn them into black image rectangles.
  if (textBearingPanels >= 2) return false;
  const sourceBlocks =
    page.layoutBlocks?.filter(
      (block) =>
        block.type === "text" &&
        block.text?.trim() &&
        !isStoryboardNoise(block.text),
    ) ?? [];
  const sourceWords = new Set(
    sourceBlocks.flatMap((block) => normalizeStoryboardWords(block.text ?? "")),
  );
  const outputWords = new Set(
    normalizeStoryboardWords(
      html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "),
    ),
  );
  const coveredWords = [...sourceWords].filter((word) =>
    outputWords.has(word),
  ).length;
  if (sourceWords.size > 3 && coveredWords / sourceWords.size < 0.72)
    return false;
  const mappedBlocks = (
    html.match(/data-source-bounds\s*=\s*["'][^"']+["']/gi) ?? []
  ).length;
  const expectedMappedBlocks = Math.min(
    sourceBlocks.length,
    semanticBlockCount ?? sourceBlocks.length,
  );
  if (mappedBlocks < Math.max(1, Math.ceil(expectedMappedBlocks * 0.7)))
    return false;
  const visualAssets = page.assets?.length ?? 0;
  const hydratedImages = (
    html.match(/<img\b[^>]*src\s*=\s*["']data:image\//gi) ?? []
  ).length;
  if (visualAssets && hydratedImages < Math.min(visualAssets, 1)) return false;
  const semanticStructures = (
    html.match(
      /<(?:section|article|table|figure|fieldset|input|textarea|select)\b/gi,
    ) ?? []
  ).length;
  return semanticStructures >= 1;
}

function isLightSourceText(value?: string) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return false;
  const [red, green, blue] = hexRgb(value)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722 > 0.72;
}

function normalizeStoryboardWords(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function mupdfColor(color: number[]) {
  const rgb =
    color.length === 1 ? [color[0], color[0], color[0]] : color.slice(0, 3);
  return `#${rgb
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel ?? 0)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function useObjectUrl(blob?: Blob) {
  const url = useMemo(
    () => (blob ? URL.createObjectURL(blob) : undefined),
    [blob],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

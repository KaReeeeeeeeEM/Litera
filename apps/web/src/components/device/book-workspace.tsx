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
  StructuredPage,
  TextCatalogEntry,
} from "@/components/device/device-types";
import {
  projectProgress,
  stageProgressValue,
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
    if (stage === "preview" && stageProgressValue(book, "preview") < 100) {
      toast.warning("Complete Storyboard before opening Preview.");
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
              const disabled =
                (stage.slug === "preview" && progress < 100) ||
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
                      {isRunning ? `Running · ${progress}%` : `${progress}%`}
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
  onStoryboardPageReadyChange,
}: {
  active: StageSlug;
  book: DeviceBook;
  providerConfigured: boolean;
  providerKeys?: ProviderKeys;
  rerenderingPages: number[];
  onStoryboardPageReadyChange: (ready: boolean) => void;
  onConfigureProvider: () => void;
  onSelectStage: (stage: StageSlug) => Promise<void>;
  onChange: Props["onChange"];
}) {
  const stage = stages.find((item) => item.slug === active)!;
  const [processing, setProcessing] = useState(false);
  const cancelled = useRef(false);
  const runController = useRef<AbortController | undefined>(undefined);
  const running = processing;
  const progress =
    active === "extract"
      ? extractionProgress(book)
      : stageProgressValue(book, active);
  const prerequisiteBlocked =
    active === "speech" && (book.stageProgress?.language ?? 0) < 100;
  async function run() {
    if (active === "preview") return;
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
      setProcessing(true);
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
          const structuredPages = [
            ...(working.structuredPages ?? []).filter(
              (candidate) => candidate.pageNumber !== structuredPage.pageNumber,
            ),
            structuredPage,
          ].sort((a, b) => a.pageNumber - b.pageNumber);
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
        working = {
          ...working,
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
        setProcessing(false);
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
      setProcessing(true);
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
              const storyboardPage = await renderStoryboardSourcePage({
                book,
                sourcePage,
                structuredPages,
                tableOfContents,
                publicationPalette,
                providerKeys: providerConfigured ? providerKeys : undefined,
                visionProvider,
                signal: controller.signal,
              });
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
        setProcessing(false);
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
      setProcessing(true);
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
        const captionConcurrency = working.performanceMode === "maximum" ? 3 : 2;
        let fallbackCaptionCount = 0;
        for (let index = 0; index < pages.length; index += captionConcurrency) {
          const batch = pages.slice(index, index + captionConcurrency);
          const results = await Promise.all(
            batch.map(async (page) => {
              const storedPage = book.extractedPages?.find(
                (candidate) => candidate.number === page.pageNumber,
              );
              if (!storedPage) return { page, captions: [] };
              const extractedPage = await ensurePageGeometry(book, storedPage);
              const thumbnail = await readablePageImage(book, extractedPage);
              const assets = await ensurePageAssets(book, {
                ...extractedPage,
                thumbnail,
              });
              const requestedIds = new Set(
                page.blocks
                  .filter((block) => block.kind === "image" && block.assetId)
                  .map((block) => block.assetId!),
              );
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
            }),
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
          await onChange(
            working,
            `Captioned visuals on page ${page.pageNumber}`,
          );
          }
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
        setProcessing(false);
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
      setProcessing(true);
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
        const sourceTextCatalog = buildTextCatalog(working);
        working = {
          ...working,
          sourceTextCatalog,
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
        const readingLevel = book.readingLevel ?? "middle";
        const language =
          book.conversionConfig?.editingLanguage &&
          book.conversionConfig.editingLanguage !== "auto"
            ? book.conversionConfig.editingLanguage
            : (book.metadata?.languageCode ?? "en");
        let easyReadCatalog = buildEasyReadCatalog(sourceTextCatalog, readingLevel);
        if (providerKeys) {
          try {
            const provider = selectTranslationProvider(providerKeys);
            easyReadCatalog = await withProviderRetry(
              () => adaptCatalogForReadingLevel({
                entries: sourceTextCatalog,
                language,
                level: readingLevel,
                keys: providerKeys,
                provider,
                signal: controller.signal,
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
        toast.complete("The Easy Read alternative is ready for review.");
      } catch (error) {
        if (!isAbortError(error))
          toast.error(error instanceof Error ? error.message : "Easy Read failed.");
      } finally {
        if (runController.current === controller) runController.current = undefined;
        setProcessing(false);
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
      setProcessing(true);
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
        setProcessing(false);
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
      const catalogs = Object.values(book.languageCatalogs ?? {});
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
      setProcessing(true);
      try {
        const speakableCatalogItems = catalogs.flatMap((catalog) =>
          catalog.entries
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
        const persistedSpeech = (book.speechEntries ?? []).filter(
          (entry) =>
            catalogEntryIds.has(entry.id) &&
            entry.inputText === catalogSpeechInputs.get(entry.id) &&
            entry.voice === requestedVoice &&
            entry.speed === requestedSpeed,
        );
        let working: DeviceBook = {
          ...book,
          speechEntries: persistedSpeech,
          stageProgress: {
            ...book.stageProgress,
            speech: Math.round((persistedSpeech.length / total) * 100),
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
            !persistedSpeech.some(
              (speech) =>
                speech.id === `${catalog.language}:${entry.id}`,
            ),
        );
        const speechConcurrency =
          book.performanceMode === "eco"
            ? 8
            : book.performanceMode === "maximum"
              ? 32
              : 24;
        for (let index = 0; index < pending.length; index += speechConcurrency) {
          const batch = pending.slice(index, index + speechConcurrency);
          const generated = await Promise.all(
            batch.map(async ({ catalog, entry }) => {
              controller.signal.throwIfAborted();
              return synthesizeCatalogEntry({
                entry,
                language: catalog.language,
                provider,
                keys: providerKeys,
                voice: requestedVoice,
                speed: requestedSpeed,
                signal: controller.signal,
              });
            }),
          );
            controller.signal.throwIfAborted();
            const speechEntries = [
              ...(working.speechEntries ?? []),
              ...generated,
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
              `Generated ${generated.length} speech clips`,
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
        if (!isAbortError(error))
          toast.error(
            error instanceof Error
              ? error.message
              : "Speech generation failed.",
          );
      } finally {
        if (runController.current === controller)
          runController.current = undefined;
        setProcessing(false);
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
      setProcessing(true);
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
        setProcessing(false);
      }
      return;
    }
    if (active === "export") {
      if (!book.validationReport?.passed) {
        toast.error("Run Validate and resolve all errors before exporting.");
        return;
      }
      setProcessing(true);
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
        setProcessing(false);
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
    setProcessing(true);
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
        const text = textLayer.asText();
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
                text: line.text.replace(/\s+/g, " ").trim(),
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
      setProcessing(false);
    }
  }
  async function stop() {
    cancelled.current = true;
    runController.current?.abort(
      new DOMException("Stage stopped by the user.", "AbortError"),
    );
    runController.current = undefined;
    setProcessing(false);
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
    const rendered = await rerenderPageFromAssistant(
      prepared,
      pageNumber,
      requestedFixes,
      `manual-page-${pageNumber}-${revision.id}`,
      providerKeys,
    );
    await onChange(rendered, `Re-rendered storyboard page ${pageNumber}`);
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
  async function resolveValidationWithAi() {
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
      for (const pageNumber of affectedPages) {
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
              disabled={prerequisiteBlocked}
              onClick={() => void run()}
              title={
                prerequisiteBlocked
                  ? "Complete Language before running Speech"
                  : undefined
              }
            >
              <Play data-icon="inline-start" />
              {prerequisiteBlocked
                ? "Complete Language first"
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
      canvas.getContext("2d")?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
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
          )
            continue;
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
                    end - start < 9 &&
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
                Select next 10 unconverted pages
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
                                nextStart + 9,
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
          This shared setting guides both Captioning and Easy Read. Changing it
          marks both stages for rerun.
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
                    {stage === "easy-read" ? "Easy Read text" : "Image description"}
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
  const assistantSheetRef = { current: assistantPortal };
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
                  portalContainer={assistantSheetRef.current}
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
  return {
    ...page,
    blocks,
    html: `<!doctype html>${document.documentElement.outerHTML}`,
  };
}

function cleanImageCaption(value: string) {
  let caption = value.replace(/\s+/g, " ").trim();
  const duplicatePrefix = /^(?:(?:an?\s+)?(?:image|illustration|figure|diagram|photo|picture)\s+(?:of|showing|depicting)\s+){2,}/i;
  caption = caption.replace(duplicatePrefix, "");
  caption = caption.replace(
    /^((?:an?\s+)?(?:image|illustration|figure|diagram|photo|picture)\s+(?:of|showing|depicting)\s+)\1+/i,
    "$1",
  );
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
  const leaderRows = lines.filter((line) => /\S\s*\.{2,}\s*\d{1,4}\s*$/.test(line));
  const numberedRows = lines.filter(
    (line) =>
      line.length <= 140 &&
      /[A-Za-zÀ-ž]\S*(?:\s+\S+){0,12}\s+\d{1,4}\s*$/.test(line),
  );
  const looksLikeExercise = /\b(?:exercise|activity|questions?|zoezi|shughuli|maswali|jibu|andika)\b/i.test(lines.join(" "));
  return leaderRows.length >= 3 || (!looksLikeExercise && numberedRows.length >= 5);
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
  const printedTitles = pages
    .filter(isTableOfContentsPage)
    .flatMap((page) => [page.title, ...page.sections.map((section) => section.text)])
    .flatMap(extractPrintedContentsTitles)
    .map((value) =>
      value
        .replace(/\s*\.{2,}\s*(?:\d{1,4}|[ivxlcdm]+)\s*$/i, "")
        .replace(/\s+(?:\d{1,4}|[ivxlcdm]+)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(
      (value) =>
        value.length >= 4 &&
        !/^(?:table of contents|contents|yaliyomo|faharasa|\.{2,}|\d+|[ivxlcdm]+)$/i.test(value),
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
  let best: { page: StructuredPage; score: number; matches: number } | undefined;
  for (const page of pages) {
    if (isTableOfContentsPage(page)) continue;
    const pageTokens = new Set(
      semanticTitleTokens(
        [page.title, ...page.sections.slice(0, 8).map((section) => section.text)].join(" "),
      ),
    );
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
  const ignored = new Set(["the", "and", "of", "ya", "na", "wa", "la"]);
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
  const thumbnail = await storyboardPhase(
    `Restoring page ${sourcePage.pageNumber} image`,
    () => readablePageImage(book, extractedPage),
  );
  const assets = await storyboardPhase(
    `Restoring page ${sourcePage.pageNumber} visuals`,
    () => ensurePageAssets(book, { ...extractedPage, thumbnail }),
  );
  const renderPage = { ...extractedPage, thumbnail, assets };
  const sampledDecoration = await storyboardPhase(
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
  const storyboardPage = await storyboardPhase(
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
) {
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
    });
  } catch (error) {
    if (!instruction || isAbortError(error)) throw error;
    storyboardPage = await renderStoryboardSourcePage({
      book,
      sourcePage,
      structuredPages,
      tableOfContents,
      publicationPalette,
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
  const storyboardCss =
    storyboardPage.renderSource === "ai"
      ? await compileStoryboardTailwindCss(storyboardPages)
      : book.storyboardCss;
  const next = {
    ...book,
    storyboardPages,
    storyboardCss,
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
  const allAssets = extractedPage.assets ?? [];
  const composedExamples = allAssets.filter(
    (asset) =>
      asset.id.includes("composite-example") ||
      asset.id.includes("composite-activity-diagram"),
  );
  const semanticAssets = deduplicateStoryboardAssets(
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

function isMeaningfulStoryboardAsset(asset: ExtractedPageAsset) {
  if (
    asset.containsText &&
    !asset.id.includes("composite-example") &&
    !asset.id.includes("composite-activity-diagram")
  )
    return false;
  const { w, h } = asset.bounds;
  if (w < 12 || h < 12 || w * h < 1_500) return false;
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
  const interactionCss = `<style id="litera-activity-games">.litera-response--inline-choice{display:flex;flex-wrap:wrap;gap:.35em .8em;padding:.35em .5em;border:.1cqw solid color-mix(in srgb,${safeAccent} 38%,#fff);border-radius:.45em;background:rgba(255,255,255,.96)}.litera-response--inline-choice legend{float:left;margin-right:.6em;font-weight:700}.litera-response--inline-choice .litera-choice{display:inline-flex;min-height:1.8em;padding:.1em .35em}.litera-matching-game{position:relative;max-width:min(100%,32rem);padding:.5em;border:.1cqw solid ${safeAccent};border-radius:.55em;background:#fff}.litera-matching-game summary{cursor:pointer;color:${safeAccent};font-weight:700}.litera-matching-grid{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:.4em;align-items:center;margin-top:.5em}.litera-match-left{font-weight:700}.litera-match-arrow{text-align:center;color:${safeAccent}}.litera-matching-grid select{min-width:0;width:100%;padding:.35em;border:.1cqw solid color-mix(in srgb,${safeAccent} 55%,#777);border-radius:.35em;background:#fff}@media(max-width:520px){.litera-matching-grid{grid-template-columns:minmax(0,1fr);}.litera-match-arrow{display:none}}</style>`;
  let output = html.replace(/<\/head>/i, `${css}${interactionCss}</head>`);
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(output, "text/html");
    const pageText = document.body.textContent ?? "";
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
        insertActivityControl(
          matchingTarget,
          activityControlHtml(matchingActivity),
        );
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
      const control = activityControlHtml(activity);
      const target =
        findActivityTarget(document, activity.prompt) ??
        (activity.type === "matching"
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
        ["true-false", "multiple-choice", "matching"].includes(activity.type)
      ) {
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

function matchingPairsFromLayout(document: Document, expectedCount: number) {
  if (expectedCount < 2) return [];
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
      /^(?:column(?: [ab])?|[ab]|s\/n|\d+[.)]?|[-–—_]{3,}|\d{1,2}\/\d{1,2}\/\d{4}.*)$/i.test(
        text,
      ) ||
      /\b(?:match|study|provided|pictures|objects)\b/i.test(text)
    )
      continue;
    if (labels.at(-1)?.endsWith(" or")) labels[labels.length - 1] += ` ${text}`;
    else if (/^[\p{L}][\p{L}\s'-]+$/u.test(text)) labels.push(text);
  }
  return [...new Set(labels)]
    .slice(0, expectedCount)
    .map((right, index) => ({ left: `Picture ${index + 1}`, right }));
}

function insertNumberedQuestionControls(
  document: Document,
  activity: StructuredPage["activities"][number],
) {
  if (document.querySelector(".litera-question-answer")) return true;
  if (document.querySelectorAll(".source-answer-line").length >= 3) return true;
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

function insertActivityControl(target: Element, control: string) {
  if (!target.hasAttribute("data-layout-block")) {
    target.insertAdjacentHTML("afterend", control);
    return;
  }
  const style = target.getAttribute("style") ?? "";
  const left = style.match(/(?:^|;)\s*left\s*:\s*([\d.]+%)/i)?.[1] ?? "6%";
  const top = Number(style.match(/(?:^|;)\s*top\s*:\s*([\d.]+)%/i)?.[1] ?? 0);
  const height = Number(
    style.match(/(?:^|;)\s*min-height\s*:\s*([\d.]+)%/i)?.[1] ?? 2.5,
  );
  const width = style.match(/(?:^|;)\s*width\s*:\s*([\d.]+%)/i)?.[1] ?? "88%";
  target.insertAdjacentHTML(
    "afterend",
    `<div class="litera-response-group" style="left:${left};top:${Math.min(94, top + height + 0.6).toFixed(2)}%;width:${width}">${control}</div>`,
  );
}

function findActivityTarget(document: Document, prompt: string) {
  // OCR often appends watermarks, answer labels and the printed folio to an
  // activity prompt. Match the leading instruction sentence so the response
  // control anchors beside the exercise instead of failing the overlap gate.
  const instruction = prompt
    .split(/\bfor online (?:reading|use) only\b/i)[0]
    ?.match(/^.*?[.!?](?:\s|$)/)?.[0]
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
      return `<details class="litera-matching-game" data-activity-item="${activity.id}"><summary>Play matching activity</summary><div class="litera-matching-grid">${inferredPairs.map((pair, index) => `<span class="litera-match-left">${escapeHtmlAttribute(pair.left)}</span><span class="litera-match-arrow" aria-hidden="true">↔</span><label><span class="sr-only">Match for ${escapeHtmlAttribute(pair.left)}</span><select data-correct-answer="${escapeHtmlAttribute(pair.right)}" aria-label="Match for ${escapeHtmlAttribute(pair.left)}" aria-describedby="${activity.id}-feedback-${index + 1}"><option value="">Choose match</option>${choices.map((choice) => `<option value="${escapeHtmlAttribute(choice)}">${escapeHtmlAttribute(choice)}</option>`).join("")}</select><span class="litera-answer-feedback" id="${activity.id}-feedback-${index + 1}" aria-live="polite"></span></label>`).join("")}</div></details>`;
    }
    return `<details class="litera-matching-game" data-activity-item="${activity.id}"><summary>Play matching activity</summary><label class="litera-response litera-response--stack"><span>Choose or type the matching item</span><input type="text" autocomplete="off" aria-label="${label}"${answerAttribute()} aria-describedby="${activity.id}-feedback-1">${feedback()}</label></details>`;
  }
  if (activity.type === "drawing")
    return `<fieldset class="litera-response litera-response--stack" data-activity-item="${activity.id}" style="padding:.65em;border:.12em solid #8a8f98;border-radius:.55em;background:#fff"><legend>${label}</legend><canvas data-litera-drawing-canvas width="900" height="420" role="img" aria-label="Drawing area: ${label}" style="display:block;width:100%;height:auto;aspect-ratio:15/7;touch-action:none;border:.1em solid #9ca3af;border-radius:.35em;background:transparent"></canvas><button type="button" data-litera-clear-drawing style="justify-self:start;padding:.35em .7em;border:.1em solid #6b7280;border-radius:.35em;background:#fff">Clear drawing</button><label><span>Optional description of the drawing</span><textarea aria-label="Description: ${label}"></textarea></label></fieldset>`;
  if (activity.type === "fill-blank")
    return `<fieldset class="litera-response-set" style="--answer-count:${activity.answerCount ?? 1}" data-activity-item="${activity.id}"><legend class="sr-only">${label}</legend>${Array.from(
      { length: activity.answerCount ?? 1 },
      (_, index) =>
        `<label class="litera-response" data-activity-item="${activity.id}-${index + 1}"><span class="sr-only">Answer ${index + 1}: ${label}</span><input type="${activity.inputType ?? "text"}" inputmode="${activity.inputMode ?? "text"}" autocomplete="off" aria-label="Answer ${index + 1}: ${label}"${answerAttribute(index)} aria-describedby="${activity.id}-feedback-${index + 1}">${feedback(index)}</label>`,
    ).join("")}</fieldset>`;
  if (activity.multiline)
    return `<label class="litera-response litera-response--stack" data-activity-item="${activity.id}"><span class="sr-only">Your response: ${label}</span><textarea aria-label="${label}"></textarea></label>`;
  return `<label class="litera-response" data-activity-item="${activity.id}"><span class="sr-only">Your answer: ${label}</span><input type="${activity.inputType ?? "text"}" inputmode="${activity.inputMode ?? "text"}" autocomplete="off" aria-label="${label}"${answerAttribute()} aria-describedby="${activity.id}-feedback-1">${feedback()}</label>`;
}

function answerFeedbackRuntime() {
  return `<script data-litera-answer-feedback>(function(){var submit=document.querySelector('[data-litera-submit]');var controls=Array.from(document.querySelectorAll('.litera-response input:not([type=hidden]),.litera-response select,.litera-response textarea,.source-answer-line input,.dense-question input'));var answered=function(control){if(control.type==='radio'||control.type==='checkbox')return control.checked;return Boolean(control.value&&control.value.trim())};var update=function(){if(submit)submit.disabled=!controls.some(answered)};document.addEventListener('input',function(event){var input=event.target;if(!((input instanceof HTMLInputElement)||(input instanceof HTMLSelectElement)||(input instanceof HTMLTextAreaElement)))return;delete input.dataset.answerState;input.removeAttribute('aria-invalid');update()});document.addEventListener('change',update);if(submit)submit.addEventListener('click',function(){var clean=function(value){return value.normalize('NFKC').toLocaleLowerCase().replace(/[ ,]/g,'').trim()};var correctCount=0,checkedCount=0;controls.forEach(function(input){if(!answered(input)||!input.dataset.correctAnswer)return;checkedCount++;var correct=clean(input.value)===clean(input.dataset.correctAnswer);if(correct)correctCount++;input.dataset.answerState=correct?'correct':'incorrect';input.setAttribute('aria-invalid',String(!correct));var feedback=document.getElementById(input.getAttribute('aria-describedby')||'');if(feedback){feedback.dataset.state=correct?'correct':'incorrect';feedback.textContent=correct?'Correct - well done!':'Not correct yet - try again.'}});parent.postMessage({type:'litera-answer-feedback',correct:correctCount,incorrect:checkedCount-correctCount,checked:checkedCount},'*')});update();document.querySelectorAll('[data-litera-drawing-canvas]').forEach(function(canvas){var context=canvas.getContext('2d');if(!context)return;context.lineWidth=5;context.lineCap='round';context.strokeStyle='#172554';var drawing=false;var point=function(event){var rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}};canvas.addEventListener('pointerdown',function(event){drawing=true;canvas.setPointerCapture(event.pointerId);var p=point(event);context.beginPath();context.moveTo(p.x,p.y)});canvas.addEventListener('pointermove',function(event){if(!drawing)return;var p=point(event);context.lineTo(p.x,p.y);context.stroke()});canvas.addEventListener('pointerup',function(){drawing=false});canvas.addEventListener('pointercancel',function(){drawing=false});var clear=canvas.parentElement&&canvas.parentElement.querySelector('[data-litera-clear-drawing]');if(clear)clear.addEventListener('click',function(){context.clearRect(0,0,canvas.width,canvas.height)})})})()</script>`;
}

function localizedAnswerSubmitLabel(text: string) {
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
      { count: number; total: [number, number, number] }
    >();
    for (let y = 0; y < canvas.height; y += 1)
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const r = pixels[offset] ?? 255;
        const g = pixels[offset + 1] ?? 255;
        const b = pixels[offset + 2] ?? 255;
        if (!colored(r, g, b)) continue;
        const key = `${Math.round(r / 48)}:${Math.round(g / 48)}:${Math.round(b / 48)}`;
        const cluster = clusters.get(key) ?? { count: 0, total: [0, 0, 0] };
        cluster.count += 1;
        cluster.total = [
          cluster.total[0] + r,
          cluster.total[1] + g,
          cluster.total[2] + b,
        ];
        clusters.set(key, cluster);
      }
    const accentScore = (cluster: {
      count: number;
      total: [number, number, number];
    }) => {
      const average = cluster.total.map(
        (value) => value / Math.max(1, cluster.count),
      );
      const chroma = Math.max(...average) - Math.min(...average);
      const luminance = average.reduce((sum, value) => sum + value, 0) / 3;
      // Pale page washes cover more pixels than a heading pill or border, but
      // they are not the page's accent. Weight saturation and distance from
      // white strongly enough for the smaller, intentional source colour to
      // win without hard-coding a particular textbook palette.
      return (
        cluster.count *
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
          text: line.text.replace(/\s+/g, " ").trim(),
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
      capturePath(path, matrix, Math.max(0.65, stroke.getLineWidth()));
    },
    fillPath(path, _evenOdd, matrix) {
      capturePath(path, matrix, 0.7);
    },
  });
  function capturePath(
    path: import("mupdf").Path,
    matrix: import("mupdf").Matrix,
    thickness: number,
  ) {
    let cursor: { x: number; y: number } | undefined;
    const addSegment = (x: number, y: number) => {
      const next = transformPoint(x, y, matrix);
      if (cursor) {
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
      },
      lineTo: addSegment,
      closePath() {
        cursor = undefined;
      },
    });
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

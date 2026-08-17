"use client";

import {
  BookText,
  Check,
  CheckCircle2,
  Download,
  FileArchive,
  FileCheck2,
  Globe2,
  GraduationCap,
  GitFork,
  GitCommitHorizontal,
  Landmark,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  Video,
  Volume2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceBook, SpeechEntry } from "@/components/device/device-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportFormats,
  packageBook,
  type ExportFormat,
} from "@/lib/device-pipeline/export-engine";
import { publishArtifactToGitHub } from "@/lib/device-pipeline/github-publishing";
import { toast } from "@/lib/feedback";
import { loadProviderRouting } from "@/components/device/device-settings";

type Props = {
  book: DeviceBook;
  onChange: (book: DeviceBook, summary?: string) => Promise<void>;
  onRegenerateSpeech?: (entry: SpeechEntry, instructions?: string) => Promise<void>;
};

const voiceDescriptions: Record<string, string> = {
  alloy: "Neutral and balanced",
  ash: "Clear and conversational",
  coral: "Warm and expressive",
  echo: "Smooth and measured",
  fable: "Animated storyteller",
  nova: "Bright and friendly",
  onyx: "Deep and authoritative",
  sage: "Calm and thoughtful",
  shimmer: "Light and energetic",
  Kore: "Firm and composed",
  Puck: "Upbeat and playful",
  Aoede: "Warm and melodic",
  Charon: "Low and steady",
  Fenrir: "Bold and energetic",
};

export function SpeechWorkspace({ book, onChange, onRegenerateSpeech }: Props) {
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [regenerating, setRegenerating] = useState<SpeechEntry>();
  const routing = loadProviderRouting();
  const voices = routing.speech === "gemini"
    ? ["Kore", "Puck", "Aoede", "Charon", "Fenrir"]
    : ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];
  const selectedVoice = book.speechVoice ?? routing.voice;
  const groups = Object.groupBy(
    book.speechEntries ?? [],
    (entry) => entry.language,
  );
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Volume2 />Narration and word highlighting</CardTitle>
            <CardDescription className="mt-1">Speech assets keyed to stable catalog IDs and languages.</CardDescription>
          </div>
          <Field className="sm:w-72">
            <FieldLabel>Voice for this book</FieldLabel>
            <Select
              onValueChange={(voice) => void onChange({ ...book, speechVoice: voice }, `Selected ${voice} for speech`)}
              value={selectedVoice}
            >
              <SelectTrigger className="w-full"><SelectValue>{selectedVoice}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {voices.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      <span className="flex flex-col"><span>{voice}</span><span className="text-xs text-muted-foreground">{voiceDescriptions[voice]}</span></span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[40rem]">
          <div className="grid gap-5 pr-3">
            {Object.entries(groups).map(([language, entries]) => (
              <section key={language}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">{language}</h3>
                  <Badge variant="secondary">
                    {entries?.length ?? 0} clips
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {entries?.slice(0, visibleCounts[language] ?? 100).map((entry) => (
                    <SpeechRow entry={entry} key={entry.id} onRegenerate={setRegenerating} />
                  ))}
                </div>
                {(entries?.length ?? 0) > (visibleCounts[language] ?? 100) ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => setVisibleCounts((counts) => ({
                      ...counts,
                      [language]: (counts[language] ?? 100) + 100,
                    }))}
                    variant="outline"
                  >
                    Show 100 more
                  </Button>
                ) : null}
              </section>
            ))}
          </div>
        </ScrollArea>
        {!book.speechEntries?.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Run Speech after Language to generate narration.
          </p>
        ) : null}
      </CardContent>
      <SpeechRegenerationDialog
        entry={regenerating}
        onOpenChange={(open) => !open && setRegenerating(undefined)}
        onRegenerate={async (entry, instructions) => {
          await onRegenerateSpeech?.(entry, instructions);
          setRegenerating(undefined);
        }}
      />
    </Card>
  );
}

function SpeechRow({ entry, onRegenerate }: { entry: SpeechEntry; onRegenerate: (entry: SpeechEntry) => void }) {
  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <code className="text-[10px] text-muted-foreground">
          {entry.textId}
        </code>
        <p className="truncate text-sm">
          {entry.words.map((word) => word.word).join(" ")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <WaveAudioPlayer audio={entry.audio} label={entry.textId} />
        <Button aria-label={`Regenerate ${entry.textId}`} onClick={() => onRegenerate(entry)} size="icon" title="Regenerate this speech" variant="outline">
          <RefreshCw />
        </Button>
      </div>
    </div>
  );
}

function SpeechRegenerationDialog({ entry, onOpenChange, onRegenerate }: {
  entry?: SpeechEntry;
  onOpenChange: (open: boolean) => void;
  onRegenerate: (entry: SpeechEntry, instructions?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"faithful" | "instructions">("faithful");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!entry) return;
    setMode("faithful");
    setInstructions("");
  }, [entry]);
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(entry)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate this speech</DialogTitle>
          <DialogDescription>
            Create the clip faithfully or add pronunciation and delivery instructions for this item only.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Regeneration mode</FieldLabel>
            <ToggleGroup onValueChange={(value) => value && setMode(value as typeof mode)} type="single" value={mode} variant="outline">
              <ToggleGroupItem value="faithful">Faithful</ToggleGroupItem>
              <ToggleGroupItem value="instructions">With instructions</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {mode === "instructions" ? (
            <Field>
              <FieldLabel htmlFor="speech-regeneration-instructions">Instructions</FieldLabel>
              <Textarea
                id="speech-regeneration-instructions"
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="For example: pause briefly before the answer, and pronounce ‘IV’ as a Roman numeral."
                value={instructions}
              />
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
          <Button
            disabled={!entry || submitting || (mode === "instructions" && !instructions.trim())}
            onClick={async () => {
              if (!entry) return;
              setSubmitting(true);
              try { await onRegenerate(entry, mode === "instructions" ? instructions.trim() : undefined); }
              finally { setSubmitting(false); }
            }}
            type="button"
          >
            {submitting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const waveformBars = 64;
let activePlayerStop: (() => void) | undefined;

async function decodeWaveform(url: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(buffer);
    const channel = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(channel.length / waveformBars));
    const amplitudes = Array.from({ length: waveformBars }, (_, index) => {
      let energy = 0;
      const start = index * step;
      const end = Math.min(channel.length, start + step);
      for (let sample = start; sample < end; sample += 1) {
        const value = channel[sample] ?? 0;
        energy += value * value;
      }
      return Math.sqrt(energy / Math.max(1, end - start));
    });
    const maximum = Math.max(...amplitudes, 0.001);
    return amplitudes.map((amplitude) => amplitude / maximum);
  } finally {
    await audioContext.close();
  }
}

function formatAudioTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function WaveAudioPlayer({ audio, label }: { audio: Blob; label: string }) {
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);
  const animationRef = useRef<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[] | undefined>(undefined);

  function tick() {
    const element = audioRef.current;
    if (!element || element.paused) return;
    setProgress(element.currentTime);
    animationRef.current = requestAnimationFrame(tick);
  }

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const url = URL.createObjectURL(audio);
    const element = new Audio(url);
    urlRef.current = url;
    element.preload = "metadata";
    element.addEventListener("loadedmetadata", () => setDuration(element.duration));
    element.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    });
    audioRef.current = element;
    void decodeWaveform(url).then(setWaveform).catch(() => setWaveform(Array(waveformBars).fill(0.25) as number[]));
    return element;
  }, [audio]);

  const stop = useCallback(() => {
    const element = audioRef.current;
    if (element) { element.pause(); element.currentTime = 0; }
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setPlaying(false);
    setProgress(0);
  }, []);

  async function toggle() {
    const element = ensureAudio();
    if (playing) {
      element.pause();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setPlaying(false);
      if (activePlayerStop === stop) activePlayerStop = undefined;
      return;
    }
    if (activePlayerStop && activePlayerStop !== stop) activePlayerStop();
    activePlayerStop = stop;
    await element.play();
    setPlaying(true);
    animationRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    if (activePlayerStop === stop) activePlayerStop = undefined;
  }, [stop]);

  const seek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const element = ensureAudio();
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    element.currentTime = ratio * (element.duration || 0);
    setProgress(element.currentTime);
  }, [ensureAudio]);

  const progressRatio = duration > 0 ? progress / duration : 0;

  return (
    <div className="flex min-w-72 items-center gap-2">
      <Button aria-label={playing ? `Pause ${label}` : `Play ${label}`} onClick={() => void toggle()} size="icon-sm" type="button" variant={playing ? "default" : "ghost"}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <div aria-label={`Seek ${label}`} aria-valuemax={duration} aria-valuemin={0} aria-valuenow={progress} className="flex h-8 flex-1 cursor-pointer items-center gap-px" onClick={seek} role="slider" tabIndex={0}>
        {(waveform ?? (Array(waveformBars).fill(0.12) as number[])).map((amplitude, index) => (
          <span
            className={index / waveformBars <= progressRatio ? "min-w-px flex-1 rounded-full bg-primary" : "min-w-px flex-1 rounded-full bg-muted-foreground/30"}
            key={index}
            style={{ height: `${Math.max(2, amplitude * 28)}px` }}
          />
        ))}
      </div>
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{duration ? formatAudioTime(playing ? progress : duration) : ""}</span>
    </div>
  );
}

export function SignLanguageWorkspace({ book, onChange }: Props) {
  async function add(files: FileList | null) {
    if (!files?.length) return;
    const videos = [
      ...(book.signVideos ?? []),
      ...[...files].map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        file,
      })),
    ];
    await onChange(
      { ...book, signVideos: videos },
      `Added ${files.length} signed videos`,
    );
  }
  async function map(id: string, target: string) {
    await onChange(
      {
        ...book,
        signVideos: book.signVideos?.map((video) =>
          video.id === id ? { ...video, target } : video,
        ),
      },
      "Updated signed-media mapping",
    );
  }
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video />
          Signed media mapping
        </CardTitle>
        <CardDescription>
          Attach signed videos and map each one to a stable text ID, page,
          section, or phrase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="grid min-h-32 cursor-pointer place-items-center rounded-xl border border-dashed bg-muted/20 p-5 text-center hover:border-primary/50">
          <span>
            <Upload className="mx-auto mb-2 text-primary" />
            <strong>Add signed video files</strong>
          </span>
          <input
            accept="video/mp4,video/webm,video/quicktime"
            className="sr-only"
            multiple
            onChange={(event) => void add(event.target.files)}
            type="file"
          />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {book.signVideos?.map((video) => (
            <div className="rounded-xl border p-4" key={video.id}>
              <p className="truncate font-medium">{video.name}</p>
              <Input
                className="mt-3"
                defaultValue={video.target}
                onBlur={(event) => void map(video.id, event.target.value)}
                placeholder="Stable ID, page, section, or phrase"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ValidationWorkspace({
  book,
  onResolve,
  onSelectStage,
}: {
  book: DeviceBook;
  onResolve: () => Promise<void>;
  onSelectStage: (stage: "export" | "publish") => Promise<void>;
}) {
  const report = book.validationReport;
  const [resolving, setResolving] = useState(false);
  async function resolve() {
    setResolving(true);
    try {
      await onResolve();
    } finally {
      setResolving(false);
    }
  }
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 />
          Accessibility assessment
        </CardTitle>
        <CardDescription>
          Structural, language, media, safety, and package checks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {report ? (
          <>
            <Badge variant={report.passed ? "secondary" : "destructive"}>
              {report.passed ? <CheckCircle2 /> : <XCircle />}
              {report.passed ? "Passed" : "Needs attention"}
            </Badge>
            <div className="mt-4 grid gap-2">
              {report.issues.map((issue) => (
                <div
                  className="flex gap-3 rounded-xl border p-3"
                  key={issue.id}
                >
                  {issue.severity === "error" ? (
                    <XCircle className="shrink-0 text-destructive" />
                  ) : (
                    <FileCheck2 className="shrink-0 text-warning" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{issue.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {issue.category}
                      {issue.pageNumber ? ` · Page ${issue.pageNumber}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {!report.issues.length ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No issues found.
              </p>
            ) : null}
            {report.issues.length ? (
              <Button className="mt-5" disabled={resolving} onClick={() => void resolve()}>
                {resolving ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                Resolve by AI
              </Button>
            ) : null}
            {report.passed ? (
              <div className="mt-6 flex flex-wrap gap-3 rounded-xl border bg-muted/30 p-4">
                <div className="min-w-60 flex-1">
                  <p className="font-medium">Publication is ready</p>
                  <p className="text-sm text-muted-foreground">Choose a downloadable package or publish the book.</p>
                </div>
                <Button onClick={() => void onSelectStage("export")} variant="outline"><Download />Export</Button>
                <Button onClick={() => void onSelectStage("publish")}><Upload />Publish</Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Run Validate to assess the publication.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const exportIcons = {
  project: FileArchive,
  "litera-web": Globe2,
  scorm: GraduationCap,
  webpub: Globe2,
  epub: BookText,
  pnld: Landmark,
} as const;

export function ExportWorkspace({ book }: { book: DeviceBook }) {
  const [selected, setSelected] = useState<ExportFormat>(
    book.exportArtifact?.format ?? "litera-web",
  );
  const [preparing, setPreparing] = useState(false);

  async function download() {
    setPreparing(true);
    try {
      const artifact =
        book.exportArtifact?.format === selected
          ? book.exportArtifact
          : await packageBook(book, selected);
      const url = URL.createObjectURL(artifact.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download />
          Export publication
        </CardTitle>
        <CardDescription>
          Litera book structure and delivery formats, with the web reader
          branded as Litera Web.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 lg:grid-cols-2">
          {exportFormats.map((format) => {
            const Icon = exportIcons[format.id];
            const active = selected === format.id;
            return (
              <button
                aria-pressed={active}
                className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/35"}`}
                key={format.id}
                onClick={() => setSelected(format.id)}
                type="button"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {format.label}
                    {active ? <Check className="size-4 text-primary" /> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {format.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-col gap-4 rounded-xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong>
              {exportFormats.find((format) => format.id === selected)?.label}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">
              {book.storyboardPages?.length ?? 0} pages ·{" "}
              {Object.keys(book.languageCatalogs ?? {}).length} translated
              languages
            </p>
          </div>
          <Button
            disabled={preparing || !book.storyboardPages?.length}
            onClick={() => void download()}
          >
            {preparing ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            {preparing ? "Preparing…" : "Prepare and download"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const publishingSteps = [
  "Connect GitHub",
  "Package accessible book",
  "Upload changed files",
  "Create deployment commit",
  "Enable GitHub Pages",
  "Verify deployment",
  "Published",
];

export function PublishWorkspace({ book, onChange }: Props) {
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState(book.publishConfig?.owner ?? "");
  const [repository, setRepository] = useState(
    book.publishConfig?.repository ?? book.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  );
  const [branch, setBranch] = useState(book.publishConfig?.branch ?? "main");
  const [visibility, setVisibility] = useState<"public" | "private">(book.publishConfig?.visibility ?? "public");
  const [commitMessage, setCommitMessage] = useState("Publish accessible book from Litera");
  const [activeStep, setActiveStep] = useState("");
  const [publishing, setPublishing] = useState(false);

  async function publish() {
    if (!token.trim() || !owner.trim() || !repository.trim()) {
      toast.error("Enter a GitHub token, owner, and repository.");
      return;
    }
    setPublishing(true);
    try {
      const artifact = await packageBook(book, "litera-web");
      const result = await publishArtifactToGitHub({
        artifact: artifact.blob,
        token,
        owner,
        repository,
        branch,
        visibility,
        commitMessage,
        onStep: setActiveStep,
      });
      const deployment = {
        id: crypto.randomUUID(),
        owner,
        repository,
        branch,
        commitSha: result.commitSha,
        commitMessage,
        siteUrl: result.siteUrl,
        status: "completed" as const,
        createdAt: new Date().toISOString(),
        fileCount: result.fileCount,
      };
      await onChange({
        ...book,
        publishConfig: { owner, repository, branch, visibility },
        publishDeployments: [deployment, ...(book.publishDeployments ?? [])],
        stageProgress: { ...book.stageProgress, publish: 100 },
        pipelineRun: { stage: "publish", status: "complete", startedAt: deployment.createdAt },
        pipelineSteps: {
          ...book.pipelineSteps,
          "publish-github": { status: "complete", progress: 100, message: result.siteUrl, updatedAt: deployment.createdAt },
        },
      }, "Published accessible book to GitHub Pages");
      toast.complete("Book published successfully.");
    } catch (error) {
      setActiveStep("Publishing failed");
      toast.error(error instanceof Error ? error.message : "GitHub publishing failed.");
    } finally {
      setPublishing(false);
    }
  }

  const completedIndex = activeStep ? publishingSteps.indexOf(activeStep) : -1;
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitFork />Configure publishing</CardTitle>
          <CardDescription>
            Connect GitHub, publish the accessible Litera Web book, and enable its hosted GitHub Pages deployment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="github-token">GitHub personal access token</FieldLabel>
              <Input id="github-token" onChange={(event) => setToken(event.target.value)} placeholder="github_pat_…" type="password" value={token} />
              <p className="text-xs text-muted-foreground">The token stays in this form and is sent only to GitHub while publishing.</p>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="github-owner">Owner or organisation</FieldLabel><Input id="github-owner" onChange={(event) => setOwner(event.target.value)} placeholder="Your GitHub username or organisation" value={owner} /></Field>
              <Field><FieldLabel htmlFor="github-repository">Repository</FieldLabel><Input id="github-repository" onChange={(event) => setRepository(event.target.value)} placeholder="accessible-book" value={repository} /></Field>
              <Field><FieldLabel htmlFor="github-branch">Publishing branch</FieldLabel><Input id="github-branch" onChange={(event) => setBranch(event.target.value)} placeholder="main" value={branch} /></Field>
              <Field>
                <FieldLabel>Repository visibility</FieldLabel>
                <Select onValueChange={(value) => setVisibility(value as "public" | "private")} value={visibility}>
                  <SelectTrigger className="w-full pr-3"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectGroup></SelectContent>
                </Select>
              </Field>
            </div>
            <Field><FieldLabel htmlFor="commit-message">Commit message</FieldLabel><Input id="commit-message" onChange={(event) => setCommitMessage(event.target.value)} placeholder="Describe this accessible-book release" value={commitMessage} /></Field>
          </FieldGroup>
          <Button className="mt-6 w-full" disabled={publishing || !book.storyboardPages?.length} onClick={() => void publish()}>
            {publishing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            {publishing ? "Publishing…" : book.publishDeployments?.length ? "Publish latest changes" : "Publish book"}
          </Button>
        </CardContent>
      </Card>
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader><CardTitle>Publishing workflow</CardTitle><CardDescription>Follow every operation from packaging to the live site.</CardDescription></CardHeader>
          <CardContent><ol className="grid gap-3">{publishingSteps.map((step, index) => {
            const complete = completedIndex > index || activeStep === "Published";
            const active = step === activeStep && !complete;
            return <li className="flex items-center gap-3 text-sm" key={step}>{complete ? <CheckCircle2 className="text-primary" /> : active ? <LoaderCircle className="animate-spin text-primary" /> : <span className="size-6 rounded-full border" />}<span className={active ? "font-medium" : ""}>{step}</span></li>;
          })}</ol></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><GitCommitHorizontal />Deployments</CardTitle><CardDescription>Recent publishing history for this book.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">{book.publishDeployments?.length ? book.publishDeployments.slice(0, 5).map((deployment) => <div className="rounded-lg border p-3" key={deployment.id}><a className="font-medium text-primary hover:underline" href={deployment.siteUrl} rel="noreferrer" target="_blank">Open published book</a><p className="mt-1 text-xs text-muted-foreground">{deployment.commitSha.slice(0, 7)} · {deployment.fileCount} files · {new Date(deployment.createdAt).toLocaleString()}</p></div>) : <p className="text-sm text-muted-foreground">No deployments yet.</p>}</CardContent>
        </Card>
      </div>
    </div>
  );
}

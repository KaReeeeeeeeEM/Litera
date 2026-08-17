"use client";

import {
  Bell,
  BookOpen,
  FileUp,
  HelpCircle,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/feedback";
import { BrandMark } from "@/components/brand-mark";
import { BookPromptQueue } from "@/components/device/book-prompt-queue";
import { BookWorkspace } from "@/components/device/book-workspace";
import { ConversionSetup } from "@/components/device/conversion-setup";
import {
  DeviceOnboarding,
  hasCompletedOnboarding,
  HelpPage,
} from "@/components/device/device-onboarding";
import {
  applyDevicePreferences,
  DeviceSettingsPage,
  loadDevicePreferences,
} from "@/components/device/device-settings";
import {
  readBooks,
  readSetting,
  removeBook,
  saveBook,
} from "@/components/device/device-storage";
import { DeviceUpdater } from "@/components/device/device-updater";
import {
  type ConversionConfig,
  type DeviceBook,
  type StageSlug,
  projectProgress,
  stages,
} from "@/components/device/device-types";
import {
  emptyProviderStatus,
  loadDeviceManagedProviderKeys,
  providerStatusKey,
  ProviderVault,
  saveDeviceManagedProviderKeys,
  type ProviderKeys,
  type ProviderStatus,
} from "@/components/device/provider-vault";
import { ThemeToggle } from "@/components/theme-toggle";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const acceptedBooks =
  ".pdf,.epub,.zip,.webpub,application/pdf,application/epub+zip";
const acceptedVideos = "video/mp4,video/webm,video/quicktime";
function progressFor(book: DeviceBook, stage: StageSlug) {
  return book.stageProgress?.[stage] ?? 0;
}
function bookExists(book: DeviceBook | undefined) {
  return Boolean(book);
}

function bookIsRunning(book: DeviceBook) {
  return book.pipelineRun?.status === "running" ||
    Object.values(book.pipelineSteps ?? {}).some((step) => step?.status === "running");
}

function latestCompletedAt(book: DeviceBook) {
  return Object.values(book.pipelineSteps ?? {})
    .filter((step) => step?.status === "complete")
    .map((step) => step!.updatedAt)
    .sort()
    .at(-1);
}

function bookHasUnreadCompletion(book: DeviceBook) {
  const completedAt = latestCompletedAt(book);
  return Boolean(completedAt && (!book.lastOpenedAt || completedAt > book.lastOpenedAt));
}

function libraryDateGroup(value: string) {
  const date = new Date(value);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 7);
  const startMonth = new Date(startToday);
  startMonth.setMonth(startMonth.getMonth() - 1);
  if (date >= startToday) return "Today";
  if (date >= startYesterday) return "Yesterday";
  if (date >= startWeek) return "Last 7 days";
  if (date >= startMonth) return "Last 30 days";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function LibraryWorkspaceSkeleton() {
  return <div className="min-h-[calc(100vh-4rem)] p-5 md:p-8 lg:p-10" aria-label="Loading Litera library" aria-busy="true"><div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-[100rem] flex-col"><div className="flex flex-col gap-6 border-b pb-8 xl:flex-row xl:items-end xl:justify-between"><div className="flex flex-col gap-3"><Skeleton className="h-6 w-36 rounded-full"/><Skeleton className="h-10 w-[min(32rem,72vw)]"/><Skeleton className="h-5 w-[min(42rem,82vw)]"/></div><div className="flex w-full max-w-sm flex-col gap-2"><div className="flex justify-between"><Skeleton className="h-4 w-28"/><Skeleton className="h-4 w-10"/></div><Skeleton className="h-2 w-full rounded-full"/></div></div><div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]"><Skeleton className="aspect-[16/9] min-h-80 w-full rounded-2xl"/><div className="flex flex-col gap-4"><Skeleton className="h-32 w-full rounded-2xl"/><Skeleton className="h-32 w-full rounded-2xl"/><Skeleton className="h-32 w-full rounded-2xl"/></div></div></div></div>;
}

function BookWorkspaceSkeleton() {
  return <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[12rem_minmax(0,1fr)] bg-background" aria-label="Loading book workspace" aria-busy="true"><aside className="h-[calc(100vh-4rem)] border-r bg-muted/10 p-3"><Skeleton className="mb-5 h-9 w-full"/><div className="flex flex-col gap-2">{Array.from({ length: 8 }, (_, index) => <div className="flex items-center gap-3 rounded-xl p-2" key={index}><Skeleton className="size-8 shrink-0 rounded-full"/><div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-20"/><Skeleton className="h-3 w-9"/></div></div>)}</div></aside><section className="min-w-0 p-5 md:p-7"><div className="flex items-center justify-between gap-4 border-b pb-4"><div className="flex flex-col gap-2"><Skeleton className="h-4 w-44"/><Skeleton className="h-3 w-20"/></div><div className="flex gap-2"><Skeleton className="h-9 w-44"/><Skeleton className="size-9"/><Skeleton className="size-9"/></div></div><div className="mt-7 flex flex-col gap-6"><div className="flex items-end justify-between gap-6"><div className="flex flex-col gap-3"><Skeleton className="h-5 w-24 rounded-full"/><Skeleton className="h-10 w-64"/><Skeleton className="h-5 w-96 max-w-[60vw]"/></div><div className="flex gap-2"><Skeleton className="h-9 w-44"/><Skeleton className="h-9 w-28"/></div></div><div className="rounded-2xl border p-5"><div className="flex justify-between"><div className="flex flex-col gap-2"><Skeleton className="h-5 w-32"/><Skeleton className="h-4 w-80 max-w-[55vw]"/></div><Skeleton className="h-8 w-14"/></div><Skeleton className="mt-5 h-2 w-full rounded-full"/><div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-6 w-28 rounded-full" key={index}/>)}</div></div><div className="overflow-hidden rounded-2xl border"><div className="grid h-[min(52vh,42rem)] min-h-[30rem] grid-cols-[10rem_minmax(0,1fr)]"><div className="flex flex-col gap-2 border-r p-3"><Skeleton className="h-4 w-16"/>{Array.from({ length: 5 }, (_, index) => <div className="flex gap-2 rounded-lg p-1.5" key={index}><Skeleton className="aspect-[3/4] w-12 shrink-0"/><div className="flex flex-1 flex-col gap-2 py-1"><Skeleton className="h-3 w-full"/><Skeleton className="h-2.5 w-12"/></div></div>)}</div><div className="flex min-w-0 flex-col bg-muted/20 p-4"><Skeleton className="mx-auto aspect-[.773] h-full max-h-[38rem] max-w-full rounded-xl"/><div className="mt-3 flex gap-2"><Skeleton className="size-8"/><Skeleton className="h-8 w-24"/><Skeleton className="size-8"/><Skeleton className="ml-auto h-8 w-52"/></div></div></div></div></div></section></div>;
}

export function DeviceLibrary() {
  const [books, setBooks] = useState<DeviceBook[]>([]);
  const [systemBooks, setSystemBooks] = useState<Array<{ title: string; path: string }>>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [loadingBookId, setLoadingBookId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [tutorial, setTutorial] = useState(() => !hasCompletedOnboarding());
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [vault, setVault] = useState(false);
  const [providerStatus, setProviderStatus] =
    useState<ProviderStatus>(emptyProviderStatus);
  const [providerKeys, setProviderKeys] = useState<ProviderKeys>();
  const providerConfigured = providerStatus.configured;
  const [sidebar, setSidebar] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [validatingName, setValidatingName] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<DeviceBook>();
  const [bookSearch, setBookSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const selected = books.find((book) => book.id === selectedId);

  useEffect(() => {
    void readBooks()
      .then((items) => {
        setBooks(items);
        setSelectedId(items[0]?.id);
        setLoadingBookId(items[0]?.id);
        if (items[0]) window.setTimeout(() => setLoadingBookId(undefined), 420);
      })
      .catch(() => toast.error("Litera could not read the device library."))
      .finally(() => setLibraryLoading(false));
    void readSetting<ProviderStatus>(providerStatusKey).then((status) =>
      setProviderStatus(status ?? emptyProviderStatus),
    );
    void loadDeviceManagedProviderKeys().then((keys) => {
      if (keys) setProviderKeys(keys);
    }).catch(() => toast.error("Litera could not restore the encrypted provider keys."));
    applyDevicePreferences(loadDevicePreferences());
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke<Array<{ title: string; path: string }>>("discover_compatible_books"))
        .then(setSystemBooks)
        .catch(() => setSystemBooks([]));
    }
  }, []);

  useEffect(() => {
    if (!providerKeys) return;
    void saveDeviceManagedProviderKeys(providerKeys).then(setProviderStatus).catch(() =>
      toast.error("Litera could not keep the provider keys available on this device."),
    );
  }, [providerKeys]);

  async function persist(book: DeviceBook, summary = "Saved workspace change") {
    const version = {
      id: crypto.randomUUID(),
      number: (book.versions?.[0]?.number ?? 0) + 1,
      createdAt: new Date().toISOString(),
      summary,
      stage: book.currentStage ?? ("extract" as const),
      stageProgress: book.stageProgress ?? {},
    };
    const next = {
      ...book,
      modifiedAt: new Date().toISOString(),
      versions: [version, ...(book.versions ?? [])].slice(0, 100),
    };
    await saveBook(next);
    setBooks((current) => current.map((item) => item.id === next.id ? next : item));
  }

  async function openBook(book: DeviceBook) {
    const opened = { ...book, lastOpenedAt: new Date().toISOString() };
    setBooks((current) => current.map((item) => item.id === book.id ? opened : item));
    try {
      await saveBook(opened);
    } catch {
      // Opening the workspace must remain available even if the read marker
      // cannot be persisted on this device.
    }
    if (book.id !== selectedId) {
      setLoadingBookId(book.id);
      window.setTimeout(() => setLoadingBookId(current => current === book.id ? undefined : current), 420);
    }
    setSelectedId(book.id);
    setSidebar(false);
  }

  async function storeBooks(files: File[]) {
    const supported = files.filter((file) =>
      /\.(pdf|epub|zip|webpub)$/i.test(file.name),
    );
    if (supported.length !== files.length)
      toast.error(
        "Only PDF, EPUB, Web Publication, and ZIP packages are supported.",
      );
    try {
      for (const file of supported) {
        setValidatingName(file.name);
        const notice = toast.loading(`Checking ${file.name}…`);
        let sourceFormat: DeviceBook["sourceFormat"];
        try {
          sourceFormat = await validateSourceFile(file);
          toast.success(
            `${file.name} is a valid ${sourceFormat === "pdf" ? "PDF" : sourceFormat === "epub" ? "EPUB" : sourceFormat === "webpub" ? "Web Publication" : "project package"}.`,
            { id: notice },
          );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "That source could not be validated.",
            { id: notice },
          );
          continue;
        }
        const sourceBytes = await file.arrayBuffer();
        let sourceTotalPages: number | undefined;
        if (sourceFormat === "pdf") {
          const { default: mupdf } = await import("mupdf");
          const document = mupdf.Document.openDocument(
            sourceBytes,
            "application/pdf",
          );
          sourceTotalPages = document.countPages();
        }
        const book: DeviceBook = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          addedAt: new Date().toISOString(),
          // Keep one durable binary copy. Persisting both a Blob and its ArrayBuffer
          // makes IndexedDB clone and write a large PDF twice.
          file: new Blob([], { type: file.type || "application/octet-stream" }),
          sourceBytes,
          sourceTotalPages,
          sourceFormat,
          setupComplete: false,
          currentStage: "extract",
          stageProgress: {},
        };
        await saveBook(book);
        setSelectedId(book.id);
        setBooks((current) => [book, ...current]);
      }
    } catch {
      toast.error("Litera could not save the selected book on this device.");
    } finally {
      setValidatingName(undefined);
    }
  }
  async function importBooks(event: React.ChangeEvent<HTMLInputElement>) {
    await storeBooks(Array.from(event.target.files ?? []));
    event.target.value = "";
  }
  function dropBooks(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void storeBooks(Array.from(event.dataTransfer.files));
  }

  async function selectStage(stage: StageSlug) {
    if (!selected) return;
    await persist({ ...selected, currentStage: stage });
  }
  async function markStageComplete() {
    if (!selected) return;
    if (!providerConfigured) {
      toast.error(
        "Configure at least one AI provider before running the pipeline.",
      );
      setVault(true);
      return;
    }
    const index = stages.findIndex(
      (item) => item.slug === (selected.currentStage ?? "extract"),
    );
    const nextStage = stages[Math.min(index + 1, stages.length - 1)].slug;
    await persist({
      ...selected,
      currentStage: nextStage,
      stageProgress: {
        ...selected.stageProgress,
        [selected.currentStage ?? "extract"]: 100,
      },
    });
    toast.complete("Stage marked ready. You can return to it at any time.");
  }
  async function addVideos(event: React.ChangeEvent<HTMLInputElement>) {
    if (!selected) return;
    const files = Array.from(event.target.files ?? []);
    const videos = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      file,
    }));
    try {
      await persist({
        ...selected,
        signVideos: [...(selected.signVideos ?? []), ...videos],
      });
      if (files.length) toast.success("Signed video files added locally.");
    } catch {
      toast.error("Litera could not store those videos.");
    } finally {
      event.target.value = "";
    }
  }
  async function mapVideo(videoId: string, target: string) {
    if (!selected) return;
    await persist({
      ...selected,
      signVideos: selected.signVideos?.map((video) =>
        video.id === videoId ? { ...video, target } : video,
      ),
    });
  }
  async function updatePromptQueue(
    prompts: NonNullable<DeviceBook["correctionPrompts"]>,
  ) {
    if (selected) await persist({ ...selected, correctionPrompts: prompts });
  }
  async function deleteBook(book: DeviceBook) {
    try {
      await removeBook(book.id);
      const next = books.filter((item) => item.id !== book.id);
      setBooks(next);
      setSelectedId(next[0]?.id);
      toast.success("Book removed from this device.");
    } catch {
      toast.error("Litera could not remove that book.");
    }
  }
  async function finishSetup(config: ConversionConfig) {
    if (!selected) return;
    await persist({
      ...selected,
      setupComplete: true,
      conversionConfig: config,
      currentStage: "extract",
      stageProgress: { ...selected.stageProgress, extract: 0 },
    }, "Created conversion plan");
    toast.complete(
      "Conversion plan saved. Source inventory is ready to begin.",
    );
  }

  const activeStage =
    stages.find(
      (stage) => stage.slug === (selected?.currentStage ?? "extract"),
    ) ?? stages[0];
  const normalizedSearch = bookSearch.trim().toLocaleLowerCase();
  const visibleBooks = books.filter((book) =>
    book.name.toLocaleLowerCase().includes(normalizedSearch),
  );
  const groupedBooks = visibleBooks.reduce<Array<{ label: string; books: DeviceBook[] }>>(
    (groups, book) => {
      const label = libraryDateGroup(book.modifiedAt ?? book.addedAt);
      const group = groups.find((candidate) => candidate.label === label);
      if (group) group.books.push(book);
      else groups.push({ label, books: [book] });
      return groups;
    },
    [],
  );
  const visibleSystemBooks = systemBooks.filter((book) =>
    book.title.toLocaleLowerCase().includes(normalizedSearch) &&
    !books.some((local) => local.name.replace(/\.[^.]+$/, "") === book.title),
  );
  const unreadBooks = books.filter(bookHasUnreadCompletion);
  return (
    <main className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="flex min-h-16 items-center gap-2 px-4 lg:px-6">
          <Button
            aria-label="Open library"
            className="lg:hidden"
            onClick={() => setSidebar(true)}
            size="icon-sm"
            variant="ghost"
          >
            <Menu />
          </Button>
          <BrandMark className="mr-auto text-3xl" />
          <DeviceUpdater />
          <Popover>
            <PopoverTrigger asChild>
              <Button aria-label={`Notifications${unreadBooks.length ? `, ${unreadBooks.length} unread` : ""}`} className="relative" size="icon-sm" variant="outline">
                <Bell />
                {unreadBooks.length ? <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-primary" /> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="border-b px-4 py-3">
                <h2 className="font-semibold">Notifications</h2>
                <p className="text-xs text-muted-foreground">Completed and running book tasks</p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {books.some((book) => bookIsRunning(book) || bookHasUnreadCompletion(book)) ? books.filter((book) => bookIsRunning(book) || bookHasUnreadCompletion(book)).map((book) => (
                  <Button className="h-auto w-full justify-start px-3 py-2 text-left" key={book.id} onClick={() => void openBook(book)} variant="ghost">
                    {bookIsRunning(book) ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />}
                    <span className="min-w-0"><span className="block truncate font-medium">{book.name.replace(/\.[^.]+$/, "")}</span><span className="block text-xs text-muted-foreground">{bookIsRunning(book) ? `${stages.find((stage) => stage.slug === book.pipelineRun?.stage)?.label ?? "Pipeline"} is running` : "New completed tasks are ready to review"}</span></span>
                  </Button>
                )) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">You are all caught up.</p>}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            aria-label="Open settings"
            onClick={() => {
              setHelp(false);
              setSettings(true);
            }}
            size="icon-sm"
            variant="outline"
          >
            <Settings />
          </Button>
          <Button
            aria-label="Open help"
            onClick={() => {
              setSettings(false);
              setHelp(true);
            }}
            size="icon-sm"
            variant="outline"
          >
            <HelpCircle />
          </Button>
          <ThemeToggle />
        </div>
      </header>
      {settings ? (
        <DeviceSettingsPage
          onBack={() => setSettings(false)}
          onConfigureProviders={() => setVault(true)}
          providerStatus={providerStatus}
        />
      ) : help ? (
        <HelpPage
          onBack={() => setHelp(false)}
          onTutorial={() => {
            setHelp(false);
            setTutorial(true);
          }}
        />
      ) : (
        <div className={cn("grid min-h-[calc(100vh-4rem)] transition-[grid-template-columns] duration-400", libraryCollapsed ? "lg:grid-cols-[4.5rem_1fr]" : "lg:grid-cols-[18rem_1fr]")}>
          <aside
            className={cn(
              "fixed inset-y-16 left-0 z-40 flex h-[calc(100vh-4rem)] w-72 flex-col overflow-hidden border-r bg-background p-3 transition-all duration-400 lg:sticky lg:top-16 lg:z-auto lg:w-auto lg:translate-x-0",
              sidebar ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className={cn("mb-5 flex items-center", libraryCollapsed ? "justify-center" : "justify-between")}>
              {!libraryCollapsed ? <h2 className="font-semibold">Books</h2> : null}
              <Button aria-label={libraryCollapsed ? "Expand book library" : "Collapse book library"} className="hidden lg:inline-flex" onClick={() => setLibraryCollapsed(value => !value)} size="icon-sm" variant="ghost">{libraryCollapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</Button>
              <Button
                aria-label="Close library"
                className="lg:hidden"
                onClick={() => setSidebar(false)}
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
            <Button
              aria-label="New book"
              className={cn("mb-5", libraryCollapsed ? "w-full px-0" : "w-full")}
              onClick={() => inputRef.current?.click()}
            >
              <Plus data-icon={libraryCollapsed ? undefined : "inline-start"} />
              {!libraryCollapsed ? "New book" : null}
            </Button>
            {!libraryCollapsed ? <label className="relative mb-3 block">
              <span className="sr-only">Search books</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" onChange={(event) => setBookSearch(event.target.value)} placeholder="Search books" type="search" value={bookSearch} />
            </label> : null}
            <nav aria-label="Local book history" className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto pr-1">
              {libraryLoading ? Array.from({ length: 4 }, (_, index) => <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", libraryCollapsed && "justify-center px-2")} key={index}><Skeleton className="size-4 shrink-0 rounded-sm"/>{!libraryCollapsed ? <Skeleton className="h-4 flex-1"/> : null}</div>) : groupedBooks.map((group) => <div className="contents" key={group.label}>
                {!libraryCollapsed ? <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground first:pt-0">{group.label}</p> : null}
                {group.books.map((book) => (
                <Tooltip key={book.id}>
                <TooltipTrigger asChild><button
                  className={cn(
                    "group flex min-w-0 items-center rounded-lg py-2.5 text-left text-sm transition-colors hover:bg-primary/10",
                    libraryCollapsed ? "justify-center px-2" : "gap-3 px-3",
                    selectedId === book.id && "bg-primary/10 font-medium",
                  )}
                  onClick={() => void openBook(book)}
                  type="button"
                >
                  {bookIsRunning(book) ? <LoaderCircle aria-label="Book task running" className="size-4 shrink-0 animate-spin" /> : <BookOpen className="size-4 shrink-0" />}
                  <span className={cn("min-w-0 flex-1 truncate", libraryCollapsed && "sr-only")}>
                    {book.name.replace(/\.[^.]+$/, "")}
                  </span>
                  {bookHasUnreadCompletion(book) && selectedId !== book.id ? <span aria-label="Unread completed task" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                  {!libraryCollapsed ? <span
                    aria-label="Delete book"
                    className="rounded p-1 opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(book);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Trash2 className="size-3.5" />
                  </span> : null}
                </button></TooltipTrigger>
                {libraryCollapsed ? <TooltipContent side="right">{book.name.replace(/\.[^.]+$/, "")}</TooltipContent> : null}
                </Tooltip>
              ))}</div>)}
              {!libraryLoading && visibleSystemBooks.length ? <div className="contents">
                {!libraryCollapsed ? <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">On this device</p> : null}
                {visibleSystemBooks.map((book) => <Tooltip key={book.path}><TooltipTrigger asChild><button className={cn("flex min-w-0 items-center rounded-lg py-2.5 text-left text-sm hover:bg-primary/10", libraryCollapsed ? "justify-center px-2" : "gap-3 px-3")} onClick={() => toast.info("This compatible book is available on this device. Use New book to import it into Litera.")} type="button"><BookOpen className="size-4 shrink-0"/><span className={cn("min-w-0 flex-1 truncate", libraryCollapsed && "sr-only")}>{book.title}</span></button></TooltipTrigger><TooltipContent side="right">{book.path}</TooltipContent></Tooltip>)}
              </div> : null}
              {!libraryLoading && !visibleBooks.length && !visibleSystemBooks.length ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">No books match your search.</p> : null}
            </nav>
          </aside>
          <section
            className={cn(
              "min-w-0",
              selected && !selected.setupComplete && "p-5 md:p-8 lg:p-10",
            )}
          >
            {libraryLoading ? (
              <LibraryWorkspaceSkeleton />
            ) : selected && loadingBookId === selected.id ? (
              <BookWorkspaceSkeleton />
            ) : selected && !selected.setupComplete ? (
              <ConversionSetup
                book={selected}
                onComplete={finishSetup}
                onConfigureProvider={() => setVault(true)}
                providerConfigured={providerConfigured}
              />
            ) : bookExists(selected) ? (
              <BookWorkspace
                book={selected!}
                onChange={persist}
                onConfigureProvider={() => setVault(true)}
                providerConfigured={providerConfigured}
                providerKeys={providerKeys}
              />
            ) : selected ? (
              <div className="mx-auto max-w-[100rem] studio-enter">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <Badge variant="secondary">
                      Stored only on this device
                    </Badge>
                    <h1 className="mt-3 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                      {selected.name.replace(/\.[^.]+$/, "")}
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                      Continue at any stage without rebuilding the entire
                      publication.
                    </p>
                  </div>
                  <div className="min-w-64">
                    <div className="mb-2 flex justify-between text-sm">
                      <span>Overall progress</span>
                      <strong>{projectProgress(selected)}%</strong>
                    </div>
                    <Progress
                      className="pipeline-progress h-2"
                      value={projectProgress(selected)}
                    />
                  </div>
                </div>
                {!providerConfigured ? (
                  <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <LockKeyhole className="mt-0.5 text-primary" />
                      <div>
                        <h2 className="font-semibold">Pipeline locked</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Configure at least one AI provider to enable
                          extraction and the remaining stages.
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setVault(true)}>
                      <KeyRound data-icon="inline-start" />
                      Configure provider
                    </Button>
                  </div>
                ) : null}
                <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                  {stages.map((stage) => (
                    <button
                      className={cn(
                        "stage-tab rounded-xl border bg-background p-3 text-left transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45",
                        activeStage.slug === stage.slug &&
                          providerConfigured &&
                          "ring-2 ring-offset-2 ring-offset-background",
                      )}
                      disabled={!providerConfigured}
                      key={stage.slug}
                      onClick={() => void selectStage(stage.slug)}
                      style={
                        { "--stage-color": stage.color } as React.CSSProperties
                      }
                      type="button"
                    >
                      <stage.icon
                        className="mb-4 size-5"
                        style={{ color: stage.color }}
                      />
                      <span className="block text-sm font-semibold">
                        {stage.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {providerConfigured
                          ? `${progressFor(selected, stage.slug)}%`
                          : "Locked"}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
                  <Card className="overflow-hidden">
                    <div
                      className="h-1.5"
                      style={{ background: activeStage.color }}
                    />
                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
                          <activeStage.icon
                            style={{ color: activeStage.color }}
                          />
                        </div>
                        <div>
                          <CardTitle>{activeStage.label}</CardTitle>
                          <CardDescription className="mt-1">
                            {activeStage.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-7">
                      <div>
                        <div className="mb-2 flex justify-between text-sm">
                          <span>Stage progress</span>
                          <strong>
                            {progressFor(selected, activeStage.slug)}%
                          </strong>
                        </div>
                        <Progress
                          className="pipeline-progress h-2"
                          style={
                            {
                              "--progress-color": activeStage.color,
                            } as React.CSSProperties
                          }
                          value={progressFor(selected, activeStage.slug)}
                        />
                      </div>
                      {activeStage.slug === "sign-language" ? (
                        <div className="grid gap-4">
                          <button
                            className="grid min-h-36 place-items-center rounded-2xl border border-dashed bg-muted/20 p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
                            onClick={() => videoRef.current?.click()}
                            type="button"
                          >
                            <span>
                              <Video className="mx-auto mb-3 text-primary" />
                              <strong className="block">
                                Add signed video files
                              </strong>
                              <small className="mt-1 block text-muted-foreground">
                                MP4, WebM, or MOV · map each file to a page,
                                section, or phrase
                              </small>
                            </span>
                          </button>
                          {selected.signVideos?.length ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {selected.signVideos.map((video) => (
                                <div
                                  className="rounded-xl border bg-muted/30 p-4"
                                  key={video.id}
                                >
                                  <div className="mb-5 flex aspect-video items-center justify-center rounded-lg bg-background">
                                    <Video className="size-8 text-primary" />
                                  </div>
                                  <p className="truncate text-sm font-medium">
                                    {video.name}
                                  </p>
                                  <label
                                    className="mt-3 block text-xs text-muted-foreground"
                                    htmlFor={`video-target-${video.id}`}
                                  >
                                    Assigned page, section, or phrase
                                  </label>
                                  <Input
                                    className="mt-1.5"
                                    defaultValue={video.target}
                                    id={`video-target-${video.id}`}
                                    onBlur={(event) =>
                                      void mapVideo(
                                        video.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="e.g. Lesson 2 · Introduction"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-2xl border bg-muted/20 p-6">
                          <h3 className="font-semibold">Focused workspace</h3>
                          <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
                            Review this stage’s output, make corrections, and
                            continue only when it is ready. Automated provider
                            actions will use keys from your encrypted local
                            vault.
                          </p>
                        </div>
                      )}
                      <BookPromptQueue
                        disabled={!providerConfigured}
                        onChange={updatePromptQueue}
                        prompts={selected.correctionPrompts ?? []}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          onClick={() => inputRef.current?.click()}
                          variant="outline"
                        >
                          <FileUp data-icon="inline-start" />
                          Reimport source
                        </Button>
                        <Button
                          disabled={!providerConfigured}
                          onClick={() => void markStageComplete()}
                        >
                          Mark stage ready
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Empty className="min-h-[calc(100vh-4rem)] rounded-none border-0 bg-background">
                <div
                  className={cn(
                    "flex min-h-96 w-full max-w-4xl cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border border-dashed p-8 transition-colors",
                    dragging
                      ? "border-primary/50 bg-primary/5"
                      : "bg-muted/10 hover:border-primary/30 hover:bg-primary/[.02]",
                  )}
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target)
                      setDragging(false);
                  }}
                  onDrop={dropBooks}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      inputRef.current?.click();
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BookOpen />
                    </EmptyMedia>
                    <EmptyTitle>
                      {validatingName
                        ? `Checking ${validatingName}…`
                        : dragging
                          ? "Drop the book to begin"
                          : "Begin with a source book"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {validatingName
                        ? "Litera is checking the source signature and package structure before conversion."
                        : "Drag and drop a PDF, EPUB, Web Publication, or compatible project package in this upload area. Litera keeps it in this application’s local storage."}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      disabled={Boolean(validatingName)}
                      onClick={(event) => {
                        event.stopPropagation();
                        inputRef.current?.click();
                      }}
                    >
                      <FileUp data-icon="inline-start" />
                      {validatingName ? "Validating source…" : "Choose a book"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      or drop the file inside this dashed area
                    </p>
                  </EmptyContent>
                </div>
              </Empty>
            )}
          </section>
        </div>
      )}
      <input
        accept={acceptedBooks}
        className="sr-only"
        multiple
        onChange={importBooks}
        ref={inputRef}
        type="file"
      />
      <input
        accept={acceptedVideos}
        className="sr-only"
        multiple
        onChange={addVideos}
        ref={videoRef}
        type="file"
      />
      <DeviceOnboarding onOpenChange={setTutorial} open={tutorial} />
      <ProviderVault
        onOpenChange={setVault}
        onSaved={(status, keys) => { setProviderStatus(status); setProviderKeys(keys); }}
        onUnlocked={setProviderKeys}
        open={vault}
      />
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(value) => !value && setDeleteTarget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this book from Litera?</AlertDialogTitle><AlertDialogDescription>This removes its local source, stage outputs, queued corrections, and version history. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep book</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteTarget) void deleteBook(deleteTarget); setDeleteTarget(undefined); }}>Delete book</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

async function validateSourceFile(
  file: File,
): Promise<NonNullable<DeviceBook["sourceFormat"]>> {
  if (file.size === 0)
    throw new Error(`${file.name} is empty and cannot be converted.`);
  if (file.size > 1024 * 1024 * 1024)
    throw new Error(
      `${file.name} is larger than the current 1 GB source limit.`,
    );
  const extension = file.name.split(".").pop()?.toLowerCase();
  const header = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  if (extension === "pdf") {
    const signature = new TextDecoder("ascii").decode(header.slice(0, 5));
    if (signature !== "%PDF-")
      throw new Error(`${file.name} does not contain a valid PDF signature.`);
    return "pdf";
  }
  if (extension === "webpub") {
    try {
      const manifest = JSON.parse(await file.text()) as {
        readingOrder?: unknown;
        resources?: unknown;
      };
      if (
        !Array.isArray(manifest.readingOrder) &&
        !Array.isArray(manifest.resources)
      )
        throw new Error();
    } catch {
      throw new Error(`${file.name} is not a valid Web Publication manifest.`);
    }
    return "webpub";
  }
  if (extension === "epub" || extension === "zip") {
    if (header[0] !== 0x50 || header[1] !== 0x4b)
      throw new Error(`${file.name} is not a valid ZIP-based package.`);
    if (
      extension === "epub" &&
      !new TextDecoder("latin1").decode(header).includes("application/epub+zip")
    )
      throw new Error(`${file.name} is missing the EPUB package signature.`);
    return extension === "epub" ? "epub" : "package";
  }
  throw new Error(`${file.name} uses an unsupported source format.`);
}

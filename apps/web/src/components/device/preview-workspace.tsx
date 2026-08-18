"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Hand,
  Languages,
  List,
  Pause,
  Play,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Moon,
  Sun,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeviceBook, SpeechEntry } from "@/components/device/device-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildTextCatalog } from "@/lib/device-pipeline/language-engine";
import { alignSpeechToRenderedWords, readerTargetIds, spokenWordAtTime } from "@/lib/device-pipeline/reader-synchronization";

type HighlightMode = "word" | "sentence";
type PageSizingMode = "fit" | "dynamic";

const PAGE_SIZING_STORAGE_KEY = "litera-preview-page-sizing";

export function PreviewWorkspace({ book }: { book: DeviceBook }) {
  const pages = book.storyboardPages ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("word");
  const [pageSizingMode, setPageSizingMode] = useState<PageSizingMode>("fit");
  const [contentsOpen, setContentsOpen] = useState(false);
  const [contentsQuery, setContentsQuery] = useState("");
  const [bottomBarDark, setBottomBarDark] = useState(true);
  const [playbackRate, setPlaybackRate] = useState("1");
  const [volume, setVolume] = useState("1");
  const [language, setLanguage] = useState(book.metadata?.languageCode || "source");
  const [frameRevision, setFrameRevision] = useState(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const previewViewport = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const audio = useRef<HTMLAudioElement | undefined>(undefined);
  const activeSpeech = useRef(0);
  const [activeSpeechIndex, setActiveSpeechIndex] = useState(0);
  const playbackSession = useRef(0);
  const highlightFrame = useRef<number | undefined>(undefined);
  const playEntryRef = useRef<(entryIndex: number, session: number) => void>(() => undefined);
  const originals = useRef(new Map<HTMLElement, string>());
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const availableSpeechLanguages = useMemo(
    () => [...new Set((book.speechEntries ?? []).map((entry) => entry.language))],
    [book.speechEntries],
  );
  const effectiveLanguage = useMemo(() => {
    if (language !== "source") return language;
    const sourceCode = book.metadata?.languageCode?.toLocaleLowerCase();
    return (
      availableSpeechLanguages.find((value) => {
        const candidate = value.toLocaleLowerCase();
        return candidate === sourceCode || candidate.startsWith(`${sourceCode}-`) || sourceCode?.startsWith(`${candidate}-`);
      }) ?? availableSpeechLanguages[0]
    );
  }, [availableSpeechLanguages, book.metadata?.languageCode, language]);
  const speech = useMemo(
    () => {
      const catalogEntries = buildTextCatalog(book);
      const order = new Map(catalogEntries.map((entry, entryIndex) => [entry.id, entryIndex]));
      return (book.speechEntries ?? []).filter(
        (entry) =>
          entry.pageNumber === page?.pageNumber &&
          entry.language === effectiveLanguage,
      ).sort((a, b) => (order.get(a.textId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.textId) ?? Number.MAX_SAFE_INTEGER));
    },
    [book, book.speechEntries, effectiveLanguage, page?.pageNumber],
  );
  const speechRef = useRef(speech);
  const readerContents = useMemo(() => {
    if (book.tableOfContents?.length) return book.tableOfContents;
    const seen = new Set<string>();
    return pages.flatMap((candidate, pageIndex) =>
      candidate.blocks.flatMap((block) => {
        if (
          block.hidden ||
          !["chapter", "title", "section"].includes(block.visualRole ?? "")
        )
          return [];
        const title = block.content.replace(/\s+/g, " ").trim();
        const key = title.toLocaleLowerCase();
        if (!title || seen.has(key)) return [];
        seen.add(key);
        return [
          {
            title,
            pageNumber: candidate.digitalPageNumber ?? pageIndex + 1,
            level: block.visualRole === "chapter" ? 1 : 2,
          },
        ];
      }),
    );
  }, [book.tableOfContents, pages]);
  useEffect(() => {
    speechRef.current = speech;
  }, [speech]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem(PAGE_SIZING_STORAGE_KEY);
    if (storedMode !== "fit" && storedMode !== "dynamic") return;
    queueMicrotask(() => setPageSizingMode(storedMode));
  }, []);

  const changePageSizingMode = useCallback((mode: PageSizingMode) => {
    setPageSizingMode(mode);
    window.localStorage.setItem(PAGE_SIZING_STORAGE_KEY, mode);
  }, []);

  useEffect(() => {
    const viewport = previewViewport.current;
    if (!viewport) return;
    const updateSize = () => {
      const styles = window.getComputedStyle(viewport);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      setPreviewSize({
        width: Math.max(0, viewport.clientWidth - horizontalPadding),
        height: Math.max(0, viewport.clientHeight - verticalPadding),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const clearHighlight = useCallback(() => {
    const document = iframe.current?.contentDocument;
    if (!document) return;
    document.querySelectorAll<HTMLElement>("[data-litera-reader-highlight]").forEach((element) => {
      element.removeAttribute("data-litera-reader-highlight");
      element.querySelectorAll(".litera-spoken-word").forEach((word) => word.classList.remove("is-active"));
    });
  }, []);

  const targetFor = useCallback((entry: SpeechEntry) => {
    const document = iframe.current?.contentDocument;
    if (!document) return undefined;
    const escaped = CSS.escape(entry.textId);
    const sourceBlock = page?.blocks.find((block) => block.id === entry.textId);
    const targetIds = readerTargetIds(entry.textId, sourceBlock?.assetId);
    const assetSelector = targetIds.slice(1).map((id) => `,[data-asset-id="${CSS.escape(id)}"]`).join("");
    const direct = document.querySelector<HTMLElement>(
      `[data-id="${escaped}"],[data-block-id="${escaped}"],[data-asset-id="${escaped}"]${assetSelector}`,
    );
    if (direct) return direct;
    const needle = normalizeReaderText(entry.inputText ?? "");
    if (!needle) return undefined;
    return [...document.querySelectorAll<HTMLElement>(
      "[data-layout-block],h1,h2,h3,h4,p,li,figure,figcaption",
    )].find((element) => {
      const candidate = normalizeReaderText(
        element.tagName === "FIGURE"
          ? element.querySelector("figcaption")?.textContent ||
              element.querySelector("img")?.getAttribute("alt") || ""
          : element.textContent ?? "",
      );
      return candidate === needle ||
        (candidate.length > 18 && needle.length > 18 &&
          (candidate.includes(needle) || needle.includes(candidate)));
    });
  }, [page?.blocks]);

  const prepareHighlight = useCallback((entry: SpeechEntry) => {
    clearHighlight();
    const target = targetFor(entry);
    if (!target) return;
    target.dataset.literaReaderHighlight = "sentence";
    if (highlightMode !== "word" || target.tagName === "FIGURE") return;
    if (!originals.current.has(target)) originals.current.set(target, target.innerHTML);
    if (!target.querySelector(".litera-spoken-word")) {
      const document = target.ownerDocument;
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      let wordIndex = 0;
      for (const node of nodes) {
        if (node.parentElement?.closest("script,style,.sr-only")) continue;
        const fragment = document.createDocumentFragment();
        const pieces = (node.data.match(/\S+|\s+/g) ?? []);
        for (const piece of pieces) {
          if (/^\s+$/.test(piece)) fragment.append(piece);
          else {
            const span = document.createElement("span");
            span.className = "litera-spoken-word";
            span.dataset.wordIndex = String(wordIndex++);
            span.textContent = piece;
            fragment.append(span);
          }
        }
        node.replaceWith(fragment);
      }
      target.dataset.literaReaderHighlight = "word";
    }
  }, [clearHighlight, highlightMode, targetFor]);

  const updateWordHighlight = useCallback((entry: SpeechEntry, currentSeconds: number, audioDurationSeconds: number) => {
    if (highlightMode !== "word") return;
    const target = targetFor(entry);
    if (!target) return;
    const renderedWords = [...target.querySelectorAll<HTMLElement>(".litera-spoken-word")];
    if (!renderedWords.length) return;
    const spokenIndex = spokenWordAtTime(entry, currentSeconds, audioDurationSeconds);
    const alignment = alignSpeechToRenderedWords(
      entry.words.map((word) => word.word),
      renderedWords.map((word) => word.textContent ?? ""),
    );
    const wordIndex = alignment[spokenIndex] ?? -1;
    target.querySelectorAll(".litera-spoken-word.is-active").forEach((word) => word.classList.remove("is-active"));
    if (wordIndex >= 0)
      target.querySelector<HTMLElement>(`.litera-spoken-word[data-word-index="${wordIndex}"]`)?.classList.add("is-active");
  }, [highlightMode, targetFor]);

  const changePage = useCallback((next: number) => {
    audio.current?.pause();
    if (highlightFrame.current !== undefined) cancelAnimationFrame(highlightFrame.current);
    clearHighlight();
    setPlaying(false);
    activeSpeech.current = 0;
    setActiveSpeechIndex(0);
    originals.current.clear();
    setIndex(Math.max(0, Math.min(pages.length - 1, next)));
  }, [clearHighlight, pages.length]);

  const playEntry = useCallback((entryIndex: number, session: number) => {
    if (session !== playbackSession.current) return;
    const entries = speechRef.current;
    const entry = entries[entryIndex];
    if (!entry) {
      setPlaying(false);
      clearHighlight();
      if (autoplay && index < pages.length - 1) changePage(index + 1);
      return;
    }
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
    const player = new Audio(URL.createObjectURL(entry.audio));
    player.playbackRate = Number(playbackRate);
    player.volume = Number(volume);
    activeSpeech.current = entryIndex;
    setActiveSpeechIndex(entryIndex);
    prepareHighlight(entry);
    const paintHighlight = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) updateWordHighlight(entry, player.currentTime, player.duration);
      if (!player.paused && !player.ended) highlightFrame.current = requestAnimationFrame(paintHighlight);
    };
    player.onplay = paintHighlight;
    player.onpause = () => { if (highlightFrame.current !== undefined) cancelAnimationFrame(highlightFrame.current); };
    player.onended = () => playEntryRef.current(entryIndex + 1, session);
    player.onerror = () => playEntryRef.current(entryIndex + 1, session);
    audio.current = player;
    void player.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [autoplay, changePage, clearHighlight, index, pages.length, playbackRate, prepareHighlight, updateWordHighlight, volume]);
  useEffect(() => {
    playEntryRef.current = playEntry;
  }, [playEntry]);

  function toggleSpeech() {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    if (audio.current?.paused && audio.current.currentTime > 0) {
      void audio.current.play().then(() => setPlaying(true));
      return;
    }
    const session = ++playbackSession.current;
    playEntry(0, session);
  }

  function stopSpeech() {
    playbackSession.current += 1;
    if (highlightFrame.current !== undefined) cancelAnimationFrame(highlightFrame.current);
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
    audio.current = undefined;
    activeSpeech.current = 0;
    setActiveSpeechIndex(0);
    setPlaying(false);
    clearHighlight();
  }

  function skipSpeech(offset: number) {
    if (!speech.length) return;
    const next = Math.max(0, Math.min(speech.length - 1, activeSpeech.current + offset));
    const session = ++playbackSession.current;
    playEntry(next, session);
  }

  useEffect(() => () => {
    playbackSession.current += 1;
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
  }, []);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLocaleLowerCase() === "x") setContentsOpen(true);
      if (event.key === "Escape") setContentsOpen(false);
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!autoplay || !speech.length || !frameRevision) return;
    const session = ++playbackSession.current;
    const frame = requestAnimationFrame(() => playEntry(0, session));
    return () => {
      cancelAnimationFrame(frame);
      if (playbackSession.current === session) {
        playbackSession.current += 1;
        audio.current?.pause();
      }
    };
  }, [autoplay, frameRevision, index, language, playEntry, speech.length]);

  function prepareFrame() {
    const document = iframe.current?.contentDocument;
    if (!document || document.getElementById("litera-reader-highlight-style")) return;
    const style = document.createElement("style");
    style.id = "litera-reader-highlight-style";
    style.textContent = `[data-litera-reader-highlight="sentence"]{background:#fde68a!important;box-shadow:0 0 0 .18em #fde68a;border-radius:.14em}figure[data-litera-reader-highlight="sentence"]{outline:.35cqw solid #facc15;outline-offset:.25cqw}[data-litera-reader-highlight="word"] .litera-spoken-word.is-active{background:#fde047!important;box-shadow:0 0 0 .12em #fde047;border-radius:.12em}`;
    document.head.append(style);
    setFrameRevision((value) => value + 1);
  }

  if (!page)
    return <Card className="mt-6 p-12 text-center text-muted-foreground">Storyboard pages are required before Preview is available.</Card>;

  const languages = [
    { value: "source", label: "Original" },
    ...Object.keys(book.languageCatalogs ?? {}).map((value) => ({ value, label: value })),
  ];
  const pageSignVideos = (book.signVideos ?? []).filter((video) =>
    video.target?.includes(String(page.pageNumber)),
  );
  const normalizedContentsQuery = contentsQuery.trim().toLocaleLowerCase();
  const filteredContents = readerContents.filter((item) =>
    !normalizedContentsQuery || item.title.toLocaleLowerCase().includes(normalizedContentsQuery),
  );
  const panelTheme = bottomBarDark
    ? "border-zinc-700 bg-zinc-900 text-zinc-100 [&_[data-slot=select-trigger]]:border-zinc-700 [&_[data-slot=select-trigger]]:bg-zinc-800 [&_[data-slot=select-trigger]]:text-zinc-100"
    : "";
  const pageAspectRatio = page.sourceAspectRatio ?? 0.7727;
  const fittedPageSize = fitAspectRatio(previewSize.width, previewSize.height, pageAspectRatio);

  return (
    <Card className="relative mt-6 flex h-[calc(100dvh-9rem)] min-h-0 w-full flex-col overflow-hidden rounded-none bg-muted/30 pb-16">
      <div
        className={`flex min-h-0 w-full flex-1 justify-center p-3 sm:p-6 ${pageSizingMode === "fit" ? "items-center overflow-hidden" : "items-start overflow-auto"}`}
        ref={previewViewport}
      >
        <iframe
          className={`shrink-0 border-0 bg-white shadow-xl ${pageSizingMode === "dynamic" ? "aspect-[var(--page-ratio)] w-full" : ""}`}
          onLoad={prepareFrame}
          ref={iframe}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={page.html}
          style={pageSizingMode === "fit"
            ? { width: fittedPageSize.width, height: fittedPageSize.height }
            : { "--page-ratio": String(pageAspectRatio) } as React.CSSProperties}
          title={`${book.name}, page ${page.digitalPageNumber ?? index + 1}`}
        />
      </div>

      <div className={`absolute inset-x-0 bottom-0 z-20 flex h-14 w-full items-center justify-between gap-1 rounded-none px-3 shadow-lg ring-1 transition-colors ${bottomBarDark ? "bg-zinc-900 text-zinc-100 ring-black/30" : "bg-background text-foreground ring-border"}`} role="group" aria-label="Reader controls">
        <Popover open={contentsOpen} onOpenChange={setContentsOpen}>
          <PopoverTrigger asChild><Button aria-label="Main menu" className={`min-w-0 flex-1 justify-start sm:min-w-64 ${bottomBarDark ? "text-zinc-100 hover:bg-white/10 hover:text-white" : ""}`} variant="ghost"><List data-icon="inline-start" /><span className="truncate">{book.name}</span></Button></PopoverTrigger>
          <PopoverContent align="start" side="top" sideOffset={8} className={`max-h-[78dvh] w-[min(92vw,42rem)] overflow-hidden p-0 ${panelTheme}`}>
            <div className={`border-b p-4 text-base font-semibold ${bottomBarDark ? "border-zinc-800" : ""}`}>Contents</div>
            <div className="relative px-4"><Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search contents" onChange={(event) => setContentsQuery(event.target.value)} placeholder="Search" className={`pl-9 ${bottomBarDark ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500" : ""}`} value={contentsQuery} /></div>
            <Tabs className="min-h-0 px-4 pb-4" defaultValue="contents"><TabsList className={bottomBarDark ? "bg-zinc-800" : ""}><TabsTrigger className={bottomBarDark ? "text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white" : ""} value="contents">Contents</TabsTrigger><TabsTrigger className={bottomBarDark ? "text-zinc-300 data-[state=active]:bg-zinc-700 data-[state=active]:text-white" : ""} value="pages">Page list</TabsTrigger></TabsList>
              <TabsContent className="max-h-[52dvh] overflow-auto pt-2" value="contents"><div className="flex flex-col gap-1">{filteredContents.map((item) => { const target = pages.findIndex((candidate) => (candidate.digitalPageNumber ?? candidate.pageNumber) === item.pageNumber); return <Button className="w-full justify-start" disabled={target < 0} key={`${item.pageNumber}-${item.title}`} onClick={() => { if (target >= 0) changePage(target); setContentsOpen(false); }} size="sm" variant="ghost"><span className={`min-w-0 flex-1 truncate text-left ${item.level === 1 ? "font-semibold text-violet-400" : ""}`} style={{ paddingInlineStart: `${Math.max(0, item.level - 1) * 0.75}rem` }}>{item.title}</span><span className="tabular-nums text-muted-foreground">{item.pageNumber}</span></Button>; })}</div></TabsContent>
              <TabsContent className="max-h-[52dvh] overflow-auto pt-2" value="pages"><div className="flex flex-col gap-1">{pages.map((candidate, pageIndex) => { const digital = candidate.digitalPageNumber ?? pageIndex + 1; const section = [...readerContents].filter((item) => item.pageNumber <= digital).at(-1)?.title ?? candidate.title; const previousDigital = pages[pageIndex - 1]?.digitalPageNumber ?? pageIndex; const previousSection = pageIndex > 0 ? [...readerContents].filter((item) => item.pageNumber <= previousDigital).at(-1)?.title ?? pages[pageIndex - 1]?.title : undefined; return <div className="grid gap-1" key={candidate.pageNumber}>{section !== previousSection ? <p className={`px-2 pt-3 text-xs font-bold uppercase tracking-wide ${bottomBarDark ? "text-zinc-400" : "text-muted-foreground"}`}>{section}</p> : null}<Button className={`w-full justify-between ${bottomBarDark ? pageIndex === index ? "border-zinc-600 bg-zinc-700 text-white hover:bg-zinc-600" : "border-transparent bg-transparent text-zinc-100 hover:bg-zinc-800" : ""}`} onClick={() => { changePage(pageIndex); setContentsOpen(false); }} size="sm" variant={pageIndex === index ? "secondary" : "ghost"}><span>{digital}{pageIndex === 0 ? " (Cover)" : ""}</span><span className={bottomBarDark ? "text-zinc-400" : "text-muted-foreground"}>Print Page {candidate.pageNumber}</span></Button></div>; })}</div></TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
        <div className="flex shrink-0 items-center gap-0.5 px-1"><Button aria-label="Previous page" disabled={index === 0} onClick={() => changePage(index - 1)} size="icon" variant="ghost"><ChevronLeft /></Button><span className="min-w-16 px-2 text-center text-base tabular-nums"><span className="font-medium">{page.digitalPageNumber ?? index + 1}</span><span className="text-muted-foreground"> / {pages.length}</span></span><Button aria-label="Next page" disabled={index === pages.length - 1} onClick={() => changePage(index + 1)} size="icon" variant="ghost"><ChevronRight /></Button></div>
        <div className={`flex flex-1 items-center justify-end gap-2 pl-1 ${bottomBarDark ? "[&_button]:text-zinc-100 [&_button:hover]:bg-white/10 [&_button:hover]:text-white" : ""}`}>
          <Popover><PopoverTrigger asChild><Button aria-label="Glossary" disabled={!book.glossary?.length} size="icon" variant="ghost"><BookOpen /></Button></PopoverTrigger><PopoverContent align="end" className={`w-80 ${panelTheme}`}><p className="mb-2 font-medium">Glossary</p><dl className="flex max-h-64 flex-col gap-3 overflow-auto">{(book.glossary ?? []).map((item) => <div key={item.term}><dt className="font-medium">{item.term}</dt><dd className="text-sm text-muted-foreground">{item.definition}</dd></div>)}</dl></PopoverContent></Popover>
          <Popover open={playing} onOpenChange={(open) => { if (!open && playing) stopSpeech(); }}><PopoverTrigger asChild><Button aria-label={playing ? "Deactivate text to speech" : "Activate text to speech"} disabled={!speech.length} onClick={toggleSpeech} size="icon" variant="ghost">{playing ? <Volume2 className="animate-pulse" /> : <VolumeX />}</Button></PopoverTrigger><PopoverContent align="end" className={`w-96 ${panelTheme}`}><div className="grid gap-3"><div className="flex items-center justify-center"><Button aria-label="Previous narration" disabled={activeSpeechIndex === 0} onClick={() => skipSpeech(-1)} size="icon" variant="ghost"><SkipBack /></Button><Button aria-label={playing ? "Pause narration" : "Play narration"} onClick={toggleSpeech} size="icon" variant="ghost">{playing ? <Pause /> : <Play />}</Button><Button aria-label="Next narration" disabled={activeSpeechIndex >= speech.length - 1} onClick={() => skipSpeech(1)} size="icon" variant="ghost"><SkipForward /></Button><Button aria-label="Stop narration" onClick={stopSpeech} size="icon" variant="ghost"><Square /></Button></div><div className="grid w-full grid-cols-2 gap-3"><label className="grid min-w-0 gap-1 text-xs"><span>Playback speed</span><Select onValueChange={(value) => { setPlaybackRate(value); if (audio.current) audio.current.playbackRate = Number(value); }} value={playbackRate}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className={bottomBarDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : ""}><SelectItem value="0.75">0.75×</SelectItem><SelectItem value="1">Normal</SelectItem><SelectItem value="1.25">1.25×</SelectItem><SelectItem value="1.5">1.5×</SelectItem></SelectContent></Select></label><label className="grid min-w-0 gap-1 text-xs"><span>Volume</span><Select onValueChange={(value) => { setVolume(value); if (audio.current) audio.current.volume = Number(value); }} value={volume}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className={bottomBarDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : ""}><SelectItem value="0.5">50%</SelectItem><SelectItem value="0.75">75%</SelectItem><SelectItem value="1">100%</SelectItem></SelectContent></Select></label></div></div></PopoverContent></Popover>
          {book.signVideos?.length ? <Popover><PopoverTrigger asChild><Button aria-label="Sign language" disabled={!pageSignVideos.length} size="icon" variant="ghost"><Hand /></Button></PopoverTrigger><PopoverContent align="end" className={`w-72 ${panelTheme}`}><p className="font-medium">Sign language</p><p className="mt-1 text-sm text-muted-foreground">{pageSignVideos.length ? `${pageSignVideos.length} signed video ${pageSignVideos.length === 1 ? "is" : "are"} mapped to this page.` : "No signed video is mapped to this page."}</p></PopoverContent></Popover> : null}
          <Button aria-label={bottomBarDark ? "Use light bottom bar theme" : "Use dark bottom bar theme"} onClick={() => setBottomBarDark((value) => !value)} size="icon" variant="ghost">{bottomBarDark ? <Sun /> : <Moon />}</Button>
          <Popover><PopoverTrigger asChild><Button aria-label="Language" size="icon" variant="ghost"><Languages /></Button></PopoverTrigger><PopoverContent align="end" className={`w-60 ${panelTheme}`}><Select onValueChange={setLanguage} value={language}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className={bottomBarDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : ""}>{languages.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></PopoverContent></Popover>
          <Popover><PopoverTrigger asChild><Button aria-label="Accessibility menu" size="icon" variant="ghost"><Settings /></Button></PopoverTrigger><PopoverContent align="end" className={`grid w-80 gap-4 ${panelTheme}`}><div><p className="font-medium">Settings</p></div><div className="grid gap-3"><p className="text-sm font-medium">Display</p><label className="grid gap-2 text-sm"><span>Page sizing</span><Select onValueChange={(value) => changePageSizingMode(value as PageSizingMode)} value={pageSizingMode}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className={bottomBarDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : ""}><SelectItem value="fit">Fit to screen</SelectItem><SelectItem value="dynamic">Dynamic</SelectItem></SelectContent></Select></label></div><div className="grid gap-3 border-t border-current/20 pt-3"><p className="text-sm font-medium">Reading</p><label className="flex items-center justify-between gap-4 text-sm"><span>Read pages automatically</span><Checkbox checked={autoplay} onCheckedChange={(checked) => setAutoplay(checked === true)} /></label><label className="grid gap-2 text-sm"><span>Highlighting</span><Select onValueChange={(value) => setHighlightMode(value as HighlightMode)} value={highlightMode}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className={bottomBarDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : ""}><SelectItem value="word">Word by word</SelectItem><SelectItem value="sentence">Sentence by sentence</SelectItem></SelectContent></Select></label></div><div className="grid gap-2 border-t border-current/20 pt-3 text-sm"><p className="font-medium">Keyboard shortcuts</p><div className="flex justify-between"><span>Open table of contents</span><kbd>X</kbd></div><div className="flex justify-between"><span>Close panel</span><kbd>Esc</kbd></div></div></PopoverContent></Popover>
        </div>
      </div>
    </Card>
  );
}

function normalizeReaderText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function fitAspectRatio(availableWidth: number, availableHeight: number, aspectRatio: number) {
  if (availableWidth <= 0 || availableHeight <= 0 || aspectRatio <= 0)
    return { width: 0, height: 0 };
  const widthFromHeight = availableHeight * aspectRatio;
  if (widthFromHeight <= availableWidth)
    return { width: widthFromHeight, height: availableHeight };
  return { width: availableWidth, height: availableWidth / aspectRatio };
}

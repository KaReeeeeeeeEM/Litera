"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Languages,
  List,
  Pause,
  Settings,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeviceBook, SpeechEntry } from "@/components/device/device-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type HighlightMode = "word" | "sentence";

export function PreviewWorkspace({ book }: { book: DeviceBook }) {
  const pages = book.storyboardPages ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("word");
  const [language, setLanguage] = useState(book.metadata?.languageCode || "source");
  const iframe = useRef<HTMLIFrameElement>(null);
  const audio = useRef<HTMLAudioElement | undefined>(undefined);
  const activeSpeech = useRef(0);
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
    () =>
      (book.speechEntries ?? []).filter(
        (entry) =>
          entry.pageNumber === page?.pageNumber &&
          entry.language === effectiveLanguage,
      ),
    [book.speechEntries, effectiveLanguage, page?.pageNumber],
  );
  const speechRef = useRef(speech);
  speechRef.current = speech;

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
    return [...document.querySelectorAll<HTMLElement>("[data-id]")].find(
      (element) => element.dataset.id === entry.textId,
    );
  }, []);

  const prepareHighlight = useCallback((entry: SpeechEntry) => {
    clearHighlight();
    const target = targetFor(entry);
    if (!target) return;
    target.dataset.literaReaderHighlight = "sentence";
    if (highlightMode !== "word") return;
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

  const updateWordHighlight = useCallback((entry: SpeechEntry, currentMs: number) => {
    if (highlightMode !== "word") return;
    const target = targetFor(entry);
    if (!target) return;
    const wordIndex = entry.words.findIndex(
      (word) => currentMs >= word.startMs && currentMs < word.endMs,
    );
    target.querySelectorAll(".litera-spoken-word.is-active").forEach((word) => word.classList.remove("is-active"));
    if (wordIndex >= 0)
      target.querySelector<HTMLElement>(`.litera-spoken-word[data-word-index="${wordIndex}"]`)?.classList.add("is-active");
  }, [highlightMode, targetFor]);

  const changePage = useCallback((next: number) => {
    audio.current?.pause();
    clearHighlight();
    setPlaying(false);
    activeSpeech.current = 0;
    originals.current.clear();
    setIndex(Math.max(0, Math.min(pages.length - 1, next)));
  }, [clearHighlight, pages.length]);

  const playEntry = useCallback((entryIndex: number) => {
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
    activeSpeech.current = entryIndex;
    prepareHighlight(entry);
    player.ontimeupdate = () => updateWordHighlight(entry, player.currentTime * 1000);
    player.onended = () => playEntry(entryIndex + 1);
    player.onerror = () => playEntry(entryIndex + 1);
    audio.current = player;
    void player.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [autoplay, changePage, clearHighlight, index, pages.length, prepareHighlight, updateWordHighlight]);

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
    playEntry(0);
  }

  useEffect(() => () => {
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
  }, []);

  useEffect(() => {
    if (!autoplay || !speech.length) return;
    const frame = requestAnimationFrame(() => playEntry(0));
    return () => cancelAnimationFrame(frame);
  }, [autoplay, index, language]); // playEntry intentionally follows the current queue

  function prepareFrame() {
    const document = iframe.current?.contentDocument;
    if (!document || document.getElementById("litera-reader-highlight-style")) return;
    const style = document.createElement("style");
    style.id = "litera-reader-highlight-style";
    style.textContent = `[data-litera-reader-highlight="sentence"]{background:#fde68a!important;box-shadow:0 0 0 .18em #fde68a;border-radius:.14em}[data-litera-reader-highlight="word"] .litera-spoken-word.is-active{background:#fde047!important;box-shadow:0 0 0 .12em #fde047;border-radius:.12em}`;
    document.head.append(style);
  }

  if (!page)
    return <Card className="mt-6 p-12 text-center text-muted-foreground">Storyboard pages are required before Preview is available.</Card>;

  const languages = [
    { value: "source", label: "Original" },
    ...Object.keys(book.languageCatalogs ?? {}).map((value) => ({ value, label: value })),
  ];

  return (
    <Card className="relative mt-6 min-h-[46rem] w-full overflow-hidden bg-muted/30 p-3 sm:p-6">
      <div className="flex min-h-[40rem] w-full items-start justify-center overflow-auto pb-24">
        <iframe
          className="aspect-[var(--page-ratio)] w-full border-0 bg-white shadow-xl"
          onLoad={prepareFrame}
          ref={iframe}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={page.html}
          style={{ "--page-ratio": String(page.sourceAspectRatio ?? 0.7727) } as React.CSSProperties}
          title={`${book.name}, page ${page.digitalPageNumber ?? index + 1}`}
        />
      </div>

      <div className="absolute inset-x-3 bottom-4 z-20 mx-auto flex max-w-3xl items-center gap-1 rounded-2xl bg-popover/95 p-2 text-popover-foreground shadow-lg ring-1 ring-border backdrop-blur-md sm:inset-x-6">
        <Popover>
          <PopoverTrigger asChild><Button className="min-w-0 flex-1 justify-start sm:min-w-52" variant="ghost"><BookOpen data-icon="inline-start" /><span className="truncate">{book.metadata?.title || book.name}</span></Button></PopoverTrigger>
          <PopoverContent align="start" className="w-80"><p className="mb-2 font-medium">Contents</p><div className="max-h-64 space-y-1 overflow-auto">{(book.tableOfContents ?? []).map((item) => { const target = pages.findIndex((candidate) => candidate.pageNumber === item.pageNumber); return <Button className="w-full justify-start" key={`${item.pageNumber}-${item.title}`} onClick={() => target >= 0 && changePage(target)} size="sm" variant="ghost"><List />{item.title}</Button>; })}</div></PopoverContent>
        </Popover>
        <div className="flex shrink-0 items-center rounded-xl bg-muted/60"><Button aria-label="Previous page" disabled={index === 0} onClick={() => changePage(index - 1)} size="icon" variant="ghost"><ChevronLeft /></Button><span className="min-w-24 text-center text-sm tabular-nums">Page {page.digitalPageNumber ?? index + 1} of {pages.length}</span><Button aria-label="Next page" disabled={index === pages.length - 1} onClick={() => changePage(index + 1)} size="icon" variant="ghost"><ChevronRight /></Button></div>
        <div className="flex flex-1 justify-end">
          <Button aria-label={playing ? "Pause narration" : "Read page aloud"} disabled={!speech.length} onClick={toggleSpeech} size="icon" variant="ghost">{playing ? <Pause /> : <Volume2 />}</Button>
          <Popover><PopoverTrigger asChild><Button aria-label="Language" size="icon" variant="ghost"><Languages /></Button></PopoverTrigger><PopoverContent align="end" className="w-60"><Select onValueChange={setLanguage} value={language}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languages.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></PopoverContent></Popover>
          <Popover><PopoverTrigger asChild><Button aria-label="Reader settings" size="icon" variant="ghost"><Settings /></Button></PopoverTrigger><PopoverContent align="end" className="grid w-72 gap-4"><div><p className="font-medium">Reader settings</p><p className="mt-1 text-sm text-muted-foreground">Narration follows every text entry in page order.</p></div><label className="flex items-center justify-between gap-4 text-sm"><span>Read pages automatically</span><input checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} type="checkbox" /></label><label className="grid gap-2 text-sm"><span>Highlighting</span><Select onValueChange={(value) => setHighlightMode(value as HighlightMode)} value={highlightMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="word">Word by word</SelectItem><SelectItem value="sentence">Sentence by sentence</SelectItem></SelectContent></Select></label></PopoverContent></Popover>
        </div>
      </div>
    </Card>
  );
}

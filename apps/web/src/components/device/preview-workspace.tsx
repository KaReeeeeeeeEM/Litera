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
import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceBook } from "@/components/device/device-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PreviewWorkspace({ book }: { book: DeviceBook }) {
  const pages = book.storyboardPages ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [language, setLanguage] = useState(book.metadata?.languageCode || "source");
  const audio = useRef<HTMLAudioElement | undefined>(undefined);
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const speech = useMemo(
    () =>
      (book.speechEntries ?? []).filter(
        (entry) =>
          entry.pageNumber === page?.pageNumber &&
          (language === "source" || entry.language === language),
      ),
    [book.speechEntries, language, page?.pageNumber],
  );

  useEffect(() => () => {
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
  }, []);

  function changePage(next: number) {
    audio.current?.pause();
    setPlaying(false);
    setIndex(Math.max(0, Math.min(pages.length - 1, next)));
  }

  function toggleSpeech() {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    const entry = speech[0];
    if (!entry) return;
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
    const player = new Audio(URL.createObjectURL(entry.audio));
    player.onended = () => setPlaying(false);
    audio.current = player;
    void player.play().then(() => setPlaying(true));
  }

  if (!page)
    return <Card className="mt-6 p-12 text-center text-muted-foreground">Storyboard pages are required before Preview is available.</Card>;

  const languages = [
    { value: "source", label: "Original" },
    ...Object.keys(book.languageCatalogs ?? {}).map((value) => ({ value, label: value })),
  ];

  return (
    <Card className="relative mt-6 min-h-[46rem] overflow-hidden bg-muted/30 p-3 sm:p-6">
      <div className="mx-auto flex min-h-[40rem] max-w-5xl items-center justify-center pb-24">
        <iframe
          className="aspect-[var(--page-ratio)] max-h-[68vh] w-full rounded-md border bg-white shadow-xl"
          sandbox="allow-scripts"
          srcDoc={page.html}
          style={{ "--page-ratio": String(page.sourceAspectRatio ?? 0.7727) } as React.CSSProperties}
          title={`${book.name}, page ${page.digitalPageNumber ?? index + 1}`}
        />
      </div>

      {/* Ported from the ADT runtime dock: metadata, centered page navigation,
          then reader tools in a single translucent bottom surface. */}
      <div className="absolute inset-x-3 bottom-4 z-20 mx-auto flex max-w-3xl items-center gap-1 rounded-2xl bg-popover/95 p-2 text-popover-foreground shadow-lg ring-1 ring-border backdrop-blur-md sm:inset-x-6">
        <Popover>
          <PopoverTrigger asChild>
            <Button className="min-w-0 flex-1 justify-start sm:min-w-52" variant="ghost">
              <BookOpen data-icon="inline-start" />
              <span className="truncate">{book.metadata?.title || book.name}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <p className="mb-2 font-medium">Contents</p>
            <div className="max-h-64 space-y-1 overflow-auto">
              {(book.tableOfContents ?? []).map((item) => {
                const target = pages.findIndex((candidate) => candidate.pageNumber === item.pageNumber);
                return <Button className="w-full justify-start" key={`${item.pageNumber}-${item.title}`} onClick={() => target >= 0 && changePage(target)} size="sm" variant="ghost"><List />{item.title}</Button>;
              })}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex shrink-0 items-center rounded-xl bg-muted/60">
          <Button aria-label="Previous page" disabled={index === 0} onClick={() => changePage(index - 1)} size="icon" variant="ghost"><ChevronLeft /></Button>
          <span className="min-w-24 text-center text-sm tabular-nums">Page {page.digitalPageNumber ?? index + 1} of {pages.length}</span>
          <Button aria-label="Next page" disabled={index === pages.length - 1} onClick={() => changePage(index + 1)} size="icon" variant="ghost"><ChevronRight /></Button>
        </div>

        <div className="flex flex-1 justify-end">
          <Button aria-label={playing ? "Pause narration" : "Read page aloud"} disabled={!speech.length} onClick={toggleSpeech} size="icon" variant="ghost">{playing ? <Pause /> : <Volume2 />}</Button>
          <Popover>
            <PopoverTrigger asChild><Button aria-label="Language" size="icon" variant="ghost"><Languages /></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-60"><Select onValueChange={setLanguage} value={language}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languages.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild><Button aria-label="Reader settings" size="icon" variant="ghost"><Settings /></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-64"><p className="font-medium">Reader settings</p><p className="mt-1 text-sm text-muted-foreground">The preview preserves the book’s source layout. Use browser zoom for a larger reading view.</p></PopoverContent>
          </Popover>
        </div>
      </div>
    </Card>
  );
}

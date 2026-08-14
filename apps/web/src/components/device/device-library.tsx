"use client";

import { BookOpen, FileUp, HelpCircle, KeyRound, Menu, Plus, Trash2, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { DeviceOnboarding, hasCompletedOnboarding, HelpDialog } from "@/components/device/device-onboarding";
import { readBooks, removeBook, saveBook } from "@/components/device/device-storage";
import { DeviceUpdater } from "@/components/device/device-updater";
import { type DeviceBook, type StageSlug, projectProgress, stages } from "@/components/device/device-types";
import { ProviderVault } from "@/components/device/provider-vault";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const acceptedBooks = ".pdf,.epub,.zip,.webpub,application/pdf,application/epub+zip";
const acceptedVideos = "video/mp4,video/webm,video/quicktime";
function progressFor(book: DeviceBook, stage: StageSlug) { return book.stageProgress?.[stage] ?? 0; }

export function DeviceLibrary() {
  const [books, setBooks] = useState<DeviceBook[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [tutorial, setTutorial] = useState(() => !hasCompletedOnboarding());
  const [help, setHelp] = useState(false);
  const [vault, setVault] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const selected = books.find(book => book.id === selectedId);

  useEffect(() => {
    void readBooks().then(items => { setBooks(items); setSelectedId(items[0]?.id); }).catch(() => toast.error("Litera could not read the device library."));
  }, []);

  async function persist(book: DeviceBook) {
    const next = { ...book, modifiedAt: new Date().toISOString() };
    await saveBook(next);
    setBooks(current => [next, ...current.filter(item => item.id !== next.id)]);
  }

  async function importBooks(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    try {
      for (const file of files) {
        const book: DeviceBook = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type || "application/octet-stream", addedAt: new Date().toISOString(), file, currentStage: "extract", stageProgress: {} };
        await saveBook(book); setSelectedId(book.id);
      }
      setBooks(await readBooks());
      if (files.length) toast.success(files.length === 1 ? "Book added to your local workspace." : `${files.length} books added.`);
    } catch { toast.error("Litera could not save the selected book on this device."); }
    finally { event.target.value = ""; }
  }

  async function selectStage(stage: StageSlug) { if (!selected) return; await persist({ ...selected, currentStage: stage }); }
  async function markStageComplete() {
    if (!selected) return;
    const index = stages.findIndex(item => item.slug === (selected.currentStage ?? "extract"));
    const nextStage = stages[Math.min(index + 1, stages.length - 1)].slug;
    await persist({ ...selected, currentStage: nextStage, stageProgress: { ...selected.stageProgress, [selected.currentStage ?? "extract"]: 100 } });
    toast.success("Stage marked ready. You can return to it at any time.");
  }
  async function addVideos(event: React.ChangeEvent<HTMLInputElement>) {
    if (!selected) return;
    const files = Array.from(event.target.files ?? []);
    const videos = files.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size, file }));
    try { await persist({ ...selected, signVideos: [...(selected.signVideos ?? []), ...videos] }); if (files.length) toast.success("Signed video files added locally."); }
    catch { toast.error("Litera could not store those videos."); }
    finally { event.target.value = ""; }
  }
  async function mapVideo(videoId: string, target: string) {
    if (!selected) return;
    await persist({ ...selected, signVideos: selected.signVideos?.map(video => video.id === videoId ? { ...video, target } : video) });
  }
  async function deleteBook(book: DeviceBook) {
    try { await removeBook(book.id); const next = books.filter(item => item.id !== book.id); setBooks(next); setSelectedId(next[0]?.id); toast.success("Book removed from this device."); }
    catch { toast.error("Litera could not remove that book."); }
  }

  const activeStage = stages.find(stage => stage.slug === (selected?.currentStage ?? "extract")) ?? stages[0];
  return <main className="min-h-screen bg-muted/20">
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl"><div className="flex min-h-16 items-center gap-2 px-4 lg:px-6">
      <Button aria-label="Open library" className="lg:hidden" onClick={() => setSidebar(true)} size="icon-sm" variant="ghost"><Menu/></Button><BrandMark className="mr-auto text-3xl"/>
      <DeviceUpdater/><Button aria-label="AI provider settings" onClick={() => setVault(true)} size="icon-sm" variant="outline"><KeyRound/></Button><Button aria-label="Open help" onClick={() => setHelp(true)} size="icon-sm" variant="outline"><HelpCircle/></Button><ThemeToggle/>
    </div></header>
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[18rem_1fr]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-72 border-r bg-background p-4 transition-transform lg:static lg:z-auto lg:w-auto lg:translate-x-0", sidebar ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">Books</h2><Button aria-label="Close library" className="lg:hidden" onClick={() => setSidebar(false)} size="icon-sm" variant="ghost"><X/></Button></div>
        <Button className="mb-5 w-full" onClick={() => inputRef.current?.click()}><Plus data-icon="inline-start"/>New book</Button>
        <nav aria-label="Local book history" className="grid gap-1">{books.map(book => <button className={cn("group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted", selectedId === book.id && "bg-muted font-medium")} key={book.id} onClick={() => { setSelectedId(book.id); setSidebar(false); }} type="button"><BookOpen className="size-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{book.name.replace(/\.[^.]+$/, "")}</span><span aria-label="Delete book" className="rounded p-1 opacity-0 hover:text-destructive group-hover:opacity-100" onClick={event => { event.stopPropagation(); void deleteBook(book); }} role="button" tabIndex={0}><Trash2 className="size-3.5"/></span></button>)}</nav>
      </aside>
      <section className="min-w-0 p-5 md:p-8 lg:p-10">{selected ? <div className="mx-auto max-w-7xl studio-enter">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><Badge variant="secondary">Stored only on this device</Badge><h1 className="mt-3 truncate text-3xl font-semibold tracking-tight sm:text-4xl">{selected.name.replace(/\.[^.]+$/, "")}</h1><p className="mt-2 text-muted-foreground">Continue at any stage without rebuilding the entire publication.</p></div><div className="min-w-64"><div className="mb-2 flex justify-between text-sm"><span>Overall progress</span><strong>{projectProgress(selected)}%</strong></div><Progress className="pipeline-progress h-2" value={projectProgress(selected)}/></div></div>
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">{stages.map(stage => <button className={cn("stage-tab rounded-xl border bg-background p-3 text-left transition-all hover:-translate-y-0.5", activeStage.slug === stage.slug && "ring-2 ring-offset-2 ring-offset-background")} key={stage.slug} onClick={() => void selectStage(stage.slug)} style={{ "--stage-color": stage.color } as React.CSSProperties} type="button"><stage.icon className="mb-4 size-5" style={{ color: stage.color }}/><span className="block text-sm font-semibold">{stage.label}</span><span className="mt-1 block text-xs text-muted-foreground">{progressFor(selected, stage.slug)}%</span></button>)}</div>
        <Card className="mt-8 overflow-hidden"><div className="h-1.5" style={{ background: activeStage.color }}/><CardHeader><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><activeStage.icon style={{ color: activeStage.color }}/></div><div><CardTitle>{activeStage.label}</CardTitle><CardDescription className="mt-1">{activeStage.description}</CardDescription></div></div></CardHeader><CardContent className="grid gap-7">
          <div><div className="mb-2 flex justify-between text-sm"><span>Stage progress</span><strong>{progressFor(selected, activeStage.slug)}%</strong></div><Progress className="pipeline-progress h-2" style={{ "--progress-color": activeStage.color } as React.CSSProperties} value={progressFor(selected, activeStage.slug)}/></div>
          {activeStage.slug === "sign-language" ? <div className="grid gap-4"><button className="grid min-h-36 place-items-center rounded-2xl border border-dashed bg-muted/20 p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5" onClick={() => videoRef.current?.click()} type="button"><span><Video className="mx-auto mb-3 text-primary"/><strong className="block">Add signed video files</strong><small className="mt-1 block text-muted-foreground">MP4, WebM, or MOV · map each file to a page, section, or phrase</small></span></button>{selected.signVideos?.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selected.signVideos.map(video => <div className="rounded-xl border bg-muted/30 p-4" key={video.id}><div className="mb-5 flex aspect-video items-center justify-center rounded-lg bg-background"><Video className="size-8 text-primary"/></div><p className="truncate text-sm font-medium">{video.name}</p><label className="mt-3 block text-xs text-muted-foreground" htmlFor={`video-target-${video.id}`}>Assigned page, section, or phrase</label><Input className="mt-1.5" defaultValue={video.target} id={`video-target-${video.id}`} onBlur={event => void mapVideo(video.id, event.target.value)} placeholder="e.g. Lesson 2 · Introduction"/></div>)}</div> : null}</div> : <div className="rounded-2xl border bg-muted/20 p-6"><h3 className="font-semibold">Focused workspace</h3><p className="mt-2 max-w-2xl leading-7 text-muted-foreground">Review this stage’s output, make corrections, and continue only when it is ready. Automated provider actions will use keys from your encrypted local vault.</p></div>}
          <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => inputRef.current?.click()} variant="outline"><FileUp data-icon="inline-start"/>Reimport source</Button><Button onClick={() => void markStageComplete()}>Mark stage ready</Button></div>
        </CardContent></Card>
      </div> : <Empty className="mx-auto min-h-[70vh] max-w-4xl border border-dashed bg-background"><EmptyHeader><EmptyMedia variant="icon"><BookOpen/></EmptyMedia><EmptyTitle>Begin with a source book</EmptyTitle><EmptyDescription>Import a PDF, EPUB, Web Publication, or compatible project package. Litera keeps it in this application’s local storage.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={() => inputRef.current?.click()}><FileUp data-icon="inline-start"/>Choose a book</Button></EmptyContent></Empty>}</section>
    </div>
    <input accept={acceptedBooks} className="sr-only" multiple onChange={importBooks} ref={inputRef} type="file"/><input accept={acceptedVideos} className="sr-only" multiple onChange={addVideos} ref={videoRef} type="file"/>
    <DeviceOnboarding onOpenChange={setTutorial} open={tutorial}/><HelpDialog onOpenChange={setHelp} onTutorial={() => setTutorial(true)} open={help}/><ProviderVault onOpenChange={setVault} open={vault}/>
  </main>;
}

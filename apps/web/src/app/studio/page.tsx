import {
  Accessibility,
  BookOpen,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileAudio,
  ImageIcon,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  Play,
  Plus,
  Search,
  Settings,
  ScanSearch,
  Upload,
  Volume2,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { requireRole } from "@/lib/auth/guards";

const pages = [
  { number: "01", title: "Jalada", status: "ready" },
  { number: "02", title: "Utangulizi", status: "ready" },
  { number: "03", title: "Somo la kwanza", status: "current" },
  { number: "04", title: "Mazoezi", status: "draft" },
  { number: "05", title: "Tathmini", status: "draft" },
];

const blocks = [
  {
    id: "heading",
    icon: MessageSquareText,
    label: "Kichwa cha somo",
    meta: "Heading",
  },
  {
    id: "image",
    icon: ImageIcon,
    label: "Picha ya mazingira",
    meta: "Image · description ready",
  },
  {
    id: "audio",
    icon: FileAudio,
    label: "Maelezo ya kusikiliza",
    meta: "Swahili · 00:18",
  },
];

export default async function Home() {
  await requireRole(["member", "admin"]);
  return (
    <div className="min-h-screen bg-muted/35 studio-enter">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet>
            <SheetTrigger asChild><Button className="md:hidden" size="icon" variant="ghost" aria-label="Open navigation"><Menu /></Button></SheetTrigger>
            <SheetContent className="p-0" side="left">
              <SheetHeader className="border-b p-6 text-start"><SheetTitle>Litera workspace</SheetTitle><SheetDescription>Navigate the project and its pages.</SheetDescription></SheetHeader>
              <div className="flex flex-col gap-5 p-4">
                <nav aria-label="Workspace navigation" className="flex flex-col gap-1">
                  <NavItem icon={LayoutDashboard} label="Projects" />
                  <NavItem active icon={BookOpen} label="Storyboard" />
                  <NavItem icon={Volume2} label="Speech studio" />
                  <NavItem icon={Accessibility} label="Accessibility" />
                </nav>
                <Separator />
                <div className="flex flex-col gap-2">
                  <p className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pages</p>
                  {pages.map((page) => <Button className="justify-start" key={page.number} variant={page.status === "current" ? "secondary" : "ghost"}><span className="font-mono text-xs">{page.number}</span>{page.title}</Button>)}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            Li
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Litera</p>
            <p className="truncate text-xs text-muted-foreground">Accessible publishing workspace</p>
          </div>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button className="hidden sm:inline-flex" variant="outline">
            <Play data-icon="inline-start" /> Preview
          </Button>
          <ThemeToggle />
          <Button size="icon" variant="ghost" aria-label="Open project menu">
            <MoreHorizontal />
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-e bg-background p-4 md:block">
          <nav aria-label="Main navigation" className="space-y-1">
            <NavItem icon={LayoutDashboard} label="Projects" />
            <NavItem active icon={BookOpen} label="Storyboard" />
            <NavItem icon={Volume2} label="Speech studio" />
            <NavItem icon={Accessibility} label="Accessibility" />
          </nav>
          <Separator className="my-5" />
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pages</p>
            <Button size="icon-xs" variant="ghost" aria-label="Add a page">
              <Plus />
            </Button>
          </div>
          <ol className="space-y-1">
            {pages.map((page) => (
              <li key={page.number}>
                <button
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-start text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    page.status === "current" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                  type="button"
                >
                  <span className="font-mono text-xs">{page.number}</span>
                  <span className="min-w-0 flex-1 truncate">{page.title}</span>
                  {page.status === "ready" ? <CircleCheck className="size-3.5 text-primary" aria-label="Ready" /> : null}
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <NavItem icon={Settings} label="Project settings" />
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Sayansi Darasa la 4</span>
                <span aria-hidden="true">/</span>
                <span>Page 03</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Somo la kwanza</h1>
            </div>
            <Badge className="h-7 rounded-full px-3" variant="secondary">
              <Clock3 className="size-3.5" /> Saved just now
            </Badge>
            <Button>
              <ScanSearch data-icon="inline-start" /> Review page
            </Button>
          </div>

          <section aria-labelledby="canvas-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="canvas-heading" className="text-sm font-medium">Page canvas</h2>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost"><PanelLeft data-icon="inline-start" /> Fit</Button>
                <Button size="sm" variant="ghost">100% <ChevronDown data-icon="inline-end" /></Button>
              </div>
            </div>

            <Card className="overflow-hidden border-border/80 bg-background py-0 shadow-sm">
              <CardContent className="p-4 sm:p-7 lg:p-10">
                <div className="mx-auto max-w-3xl space-y-4">
                  {blocks.map((block, index) => (
                    <article
                      className={`group relative rounded-xl border bg-card p-4 transition-colors hover:border-primary/45 sm:p-5 ${index === 1 ? "border-primary ring-2 ring-primary/10" : ""}`}
                      key={block.id}
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <block.icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="font-medium">{block.label}</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">{block.meta}</p>
                            </div>
                            <Button size="icon-sm" variant="ghost" aria-label={`More options for ${block.label}`}>
                              <MoreHorizontal />
                            </Button>
                          </div>
                          {index === 0 ? (
                            <p className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Mazingira yetu</p>
                          ) : null}
                          {index === 1 ? (
                            <div className="mt-5 grid min-h-52 place-items-center rounded-lg border border-dashed bg-muted/50 px-4 text-center">
                              <div>
                                <ImageIcon className="mx-auto size-8 text-muted-foreground" />
                                <p className="mt-3 text-sm font-medium">Landscape illustration</p>
                                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">A source-aware image region with a reviewed Swahili description and responsive crop.</p>
                                <Button className="mt-4" size="sm" variant="outline"><Upload data-icon="inline-start" /> Replace media</Button>
                              </div>
                            </div>
                          ) : null}
                          {index === 2 ? (
                            <div className="mt-5 flex items-center gap-3 rounded-lg bg-muted/60 p-3">
                              <Button size="icon" aria-label="Play Swahili narration"><Play /></Button>
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex justify-between text-xs"><span>Kiswahili · Tanzania</span><span className="text-muted-foreground">00:18</span></div>
                                <Progress value={42} aria-label="Narration playback progress" />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}

                  <Button className="h-12 w-full border-dashed" variant="outline">
                    <Plus data-icon="inline-start" /> Add content block
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <aside className="hidden min-h-[calc(100vh-4rem)] border-s bg-background p-5 xl:block">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Page quality</h2>
            <Button size="icon-sm" variant="ghost" aria-label="Search checks"><Search /></Button>
          </div>
          <div className="mt-5 rounded-xl border bg-card p-4">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-3xl font-semibold">86%</p><p className="text-xs text-muted-foreground">Ready to publish</p></div>
              <CircleCheck className="size-6 text-primary" />
            </div>
            <Progress className="mt-4" value={86} aria-label="Page readiness" />
          </div>
          <div className="mt-6 space-y-4">
            <QualityItem label="Source coverage" value="3 / 3" ready />
            <QualityItem label="Reading order" value="Ready" ready />
            <QualityItem label="Image description" value="Review" />
            <QualityItem label="Swahili speech" value="Listen" />
            <QualityItem label="Responsive layout" value="3 sizes" ready />
          </div>
          <Separator className="my-6" />
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="text-sm font-medium">One focused recommendation</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Listen to the highlighted sentence before approving this page. Its pronunciation confidence is below the project threshold.</p>
            <Button className="mt-4 w-full" size="sm" variant="outline"><Volume2 data-icon="inline-start" /> Open speech review</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NavItem({ active = false, icon: Icon, label }: { active?: boolean; icon: typeof BookOpen; label: string }) {
  return (
    <a className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`} href="#">
      <Icon className="size-4" />{label}
    </a>
  );
}

function QualityItem({ label, ready = false, value }: { label: string; ready?: boolean; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`size-2 rounded-full ${ready ? "bg-primary" : "bg-warning"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

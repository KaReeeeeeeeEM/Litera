import type { Metadata } from "next";
import Link from "next/link";
import { Accessibility, ArrowRight, AudioLines, Check, CircleCheck, Gauge, Languages, LayoutTemplate, BookOpenCheck, Volume2 } from "lucide-react";

import { PageShell } from "@/components/site/page-shell";
import { TechnologyMarquee } from "@/components/site/technology-marquee";
import { FaqSection } from "@/components/site/faq-section";
import { VectorScene } from "@/components/site/vector-scene";
import { ProductWalkthrough } from "@/components/landing/product-walkthrough";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = { title: { absolute: "Litera — Inclusive publishing, made clear" }, description: "Create responsive, accessible and Swahili-first digital learning publications.", alternates: { canonical: "/" } };

const capabilities = [
  { icon: LayoutTemplate, title: "Shape every page visually", text: "Compose meaningful blocks while Litera protects structure, reading order and responsive behaviour.", className: "md:col-span-2 lg:col-span-1 lg:row-span-2" },
  { icon: Volume2, title: "Hear Swahili in context", text: "Review pronunciation sentence by sentence and regenerate only what changed.", className: "lg:col-span-2" },
  { icon: Accessibility, title: "Build access in", text: "Keep descriptions, keyboard routes and learner alternatives visible while authoring.", className: "" },
  { icon: Gauge, title: "Publish with evidence", text: "Know exactly what is ready, what needs review and what blocks release.", className: "" },
];

export default function HomePage() {
  return (
    <PageShell>
      <main>
        <section className="relative isolate overflow-hidden border-b">
          <div className="ambient-grid pointer-events-none absolute inset-0 -z-10" />
          <div className="pointer-events-none absolute -end-32 top-10 -z-10 size-[32rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 lg:grid-cols-[1.03fr_.97fr] lg:items-center lg:px-8 lg:py-28">
            <div className="studio-enter">
              <Badge variant="secondary"><BookOpenCheck />Built for inclusive learning teams</Badge>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[.95] tracking-[-0.06em] sm:text-6xl lg:text-7xl">Turn source books into <span className="text-primary">living lessons.</span></h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">One calm workspace for page design, accessibility review and natural Swahili narration—from source to release.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg"><Link href="/download">Download Litera<ArrowRight data-icon="inline-end" /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/features">See how it works</Link></Button></div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">{["Source-aware", "Offline-ready", "WCAG-focused", "Responsive by default"].map((item) => <span className="flex items-center gap-2" key={item}><Check className="size-4 text-primary" />{item}</span>)}</div>
            </div>
            <HeroPreview />
          </div>
        </section>

        <TechnologyMarquee />

        <section className="mx-auto grid max-w-7xl gap-14 px-5 py-24 lg:grid-cols-2 lg:items-center lg:px-8" data-reveal>
          <div><Badge variant="secondary">Why Litera</Badge><h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Publishing should not feel like assembling a machine.</h2><p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">When storyboards, media, narration and quality checks live in separate places, every change creates more coordination. Litera replaces that friction with one visual, traceable workflow.</p><div className="mt-8 grid gap-3">{["See the whole lesson before it ships","Review language and narration in context","Make quality ownership clear to every role"].map(item => <div className="flex items-center gap-3 rounded-xl border p-4 text-sm font-medium" key={item}><CircleCheck className="size-5 text-primary"/>{item}</div>)}</div></div>
          <VectorScene variant="compose" />
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8" data-reveal>
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><Badge variant="secondary">One connected workflow</Badge><h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Complex work.<br />Clear decisions.</h2></div><p className="max-w-xl text-base leading-8 text-muted-foreground lg:justify-self-end">Litera keeps the source, page, narration and quality evidence together, so specialists can focus on the learner experience instead of chasing files.</p></div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{capabilities.map((item) => <Card className={`motion-card group min-h-56 ${item.className}`} key={item.title}><CardHeader className="p-7"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><item.icon className="size-5" /></span><CardTitle className="pt-7 text-xl">{item.title}</CardTitle><CardDescription className="max-w-md leading-7">{item.text}</CardDescription></CardHeader>{item.title === "Shape every page visually" ? <CardContent className="mt-auto px-7 pb-7"><div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">{["Heading · ready","Image · described","Audio · reviewed"].map((label)=><div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs" key={label}><CircleCheck className="size-4 text-primary" />{label}</div>)}</div></CardContent> : null}</Card>)}</div>
        </section>

        <ProductWalkthrough />

        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8" data-reveal><div className="text-center"><Badge variant="secondary">A workspace for every perspective</Badge><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em]">Everyone sees what matters to them.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3">{[["Creators","Build pages, refine narration and resolve checks without leaving the canvas."],["Stakeholders","Review progress, comment on decisions and approve releases with context."],["Administrators","Understand adoption, platform health and usage while protecting access."]].map(([title,text],index) => <Card className="motion-card" key={title}><CardHeader className="p-7"><span className="font-mono text-xs text-primary">0{index+1}</span><CardTitle className="pt-8">{title}</CardTitle><CardDescription className="leading-7">{text}</CardDescription></CardHeader></Card>)}</div></section>

        <section className="border-y bg-muted/30" data-reveal><div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 lg:grid-cols-2 lg:items-center lg:px-8"><VectorScene variant="listen"/><div><Badge variant="outline" className="bg-background">Swahili-first narration</Badge><h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">Listen where meaning lives.</h2><p className="mt-5 leading-8 text-muted-foreground">Review speech beside the exact sentence, image and learning objective it supports. Pronunciation choices remain editable and reusable without changing visible source text.</p><div className="mt-7 flex flex-wrap gap-2">{["Sentence-level review","Pronunciation memory","Targeted regeneration","Human approval"].map(item => <Badge variant="secondary" key={item}>{item}</Badge>)}</div></div></div></section>

        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8" data-reveal><div className="grid gap-8 rounded-3xl border bg-muted/25 p-8 md:grid-cols-4 lg:p-12">{[["01","Shared workspace"],["04","Clear workflow stages"],["03","Purpose-built roles"],["AA","Accessibility target"]].map(([value,label]) => <div key={label}><p className="text-4xl font-semibold tracking-tight text-primary">{value}</p><p className="mt-2 text-sm text-muted-foreground">{label}</p></div>)}</div></section>

        <FaqSection items={[["Can a creator start without technical publishing experience?","Yes. Litera presents content as meaningful visual blocks and keeps technical structure in the background."],["How does stakeholder review differ from authoring?","Stakeholders receive a focused view of progress, comments and approvals rather than the full editing surface."],["Does Litera support offline learning?","The publishing workflow is designed to produce complete packages that remain useful in low-connectivity environments."],["How is accessibility handled?","Accessibility checks are part of authoring and release readiness instead of a separate final audit."],["Can narration be corrected without rebuilding everything?","Yes. Teams can review and regenerate individual narratable items while retaining the surrounding publication."]]} />

        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8" data-reveal><Card className="relative overflow-hidden bg-primary text-primary-foreground"><div className="pointer-events-none absolute -end-20 -top-20 size-72 rounded-full bg-primary-foreground/10 blur-3xl" /><div className="relative grid gap-8 p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-14"><div><Badge variant="secondary">Start creating</Badge><h2 className="mt-5 text-4xl font-semibold tracking-tight">Make every lesson easier to reach.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75">Download Litera and begin creating with a private library that remains on your device.</p></div><Button asChild size="lg" variant="secondary"><Link href="/download">Download Litera<ArrowRight data-icon="inline-end" /></Link></Button></div></Card></section>
      </main>
    </PageShell>
  );
}

function HeroPreview() {
  return <div className="studio-enter relative [animation-delay:80ms]"><div className="absolute inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" /><Card className="rotate-[.5deg] overflow-hidden border-border/70 bg-background/95 py-0 shadow-2xl"><div className="flex items-center justify-between border-b px-4 py-3"><div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-border"/><span className="size-2.5 rounded-full bg-border"/><span className="size-2.5 rounded-full bg-primary"/></div><Badge variant="secondary">Page 03 · 86%</Badge></div><div className="grid sm:grid-cols-[8.5rem_1fr]"><div className="hidden flex-col gap-2 border-e bg-muted/40 p-3 sm:flex">{["Jalada","Utangulizi","Somo","Mazoezi"].map((item,index)=><div className={`rounded-lg px-3 py-2 text-xs ${index===2?"bg-primary text-primary-foreground":"text-muted-foreground"}`} key={item}>{item}</div>)}</div><div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Kichwa cha somo</p><p className="mt-5 text-2xl font-semibold">Mazingira yetu</p></div><div className="grid min-h-44 place-items-center rounded-xl border border-primary/35 bg-primary/5"><div className="text-center"><Languages className="mx-auto size-9 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Responsive lesson illustration</p></div></div><div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3"><span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><AudioLines className="size-4" /></span><div className="min-w-0 flex-1"><div className="mb-2 flex justify-between text-xs"><span>Kiswahili · Tanzania</span><span className="text-muted-foreground">00:18</span></div><Progress value={64} aria-label="Narration preview" /></div></div></div></div></Card></div>;
}

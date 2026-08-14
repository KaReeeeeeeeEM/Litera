"use client";

import { BookOpen, CheckCircle2, FileUp, HelpCircle, KeyRound, Layers3, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const onboardingKey = "litera-onboarding-complete-v1";
const slides = [
  { title: "Your private publishing library", description: "Every imported source and project stays in Litera’s application storage on this device.", icon: BookOpen },
  { title: "One clear pipeline", description: "Move from extraction to structure, storyboard, language, speech, signed video, validation, and export.", icon: Layers3 },
  { title: "Bring existing work back", description: "Open PDF, EPUB, Web Publication, ZIP, and completed project packages to correct only the stage you need.", icon: FileUp },
  { title: "Use your own AI providers", description: "Connect only the providers you choose. Keys are encrypted locally and never synchronized to a Litera account.", icon: KeyRound },
  { title: "Review before release", description: "Visible percentages and quality checks keep automated work inspectable and reversible.", icon: ShieldCheck },
] as const;

export function DeviceOnboarding({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  useEffect(() => { if (!api) return; const update = () => setCurrent(api.selectedScrollSnap()); const frame = window.requestAnimationFrame(update); api.on("select", update); return () => { window.cancelAnimationFrame(frame); api.off("select", update); }; }, [api]);
  function finish() { localStorage.setItem(onboardingKey, "true"); onOpenChange(false); }
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="max-w-5xl overflow-hidden p-0" showCloseButton={false}><DialogHeader className="sr-only"><DialogTitle>Welcome to Litera</DialogTitle><DialogDescription>A five-step introduction to the local publishing workspace.</DialogDescription></DialogHeader><Carousel className="px-7 pb-7 pt-10 sm:px-12 sm:pb-10 sm:pt-14" opts={{ watchDrag: true }} setApi={setApi}><CarouselContent>{slides.map((slide, index) => <CarouselItem key={slide.title}><div className="grid min-h-[27rem] gap-9 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="font-mono text-xs text-primary">0{index + 1} / 0{slides.length}</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">{slide.title}</h2><p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">{slide.description}</p></div><div className="relative grid min-h-64 place-items-center overflow-hidden rounded-3xl border bg-muted/35"><div className="absolute inset-0 ambient-grid"/><div className="relative grid size-32 place-items-center rounded-[2rem] border bg-background text-primary shadow-xl shadow-primary/10"><slide.icon className="size-14"/></div></div></div></CarouselItem>)}</CarouselContent><div className="mt-7 flex items-center justify-between gap-4"><div className="flex gap-2" aria-label={`Tutorial step ${current + 1} of ${slides.length}`}>{slides.map((slide, index) => <button aria-label={`Go to ${slide.title}`} className={cn("h-1.5 rounded-full transition-all", index === current ? "w-8 bg-primary" : "w-1.5 bg-border")} key={slide.title} onClick={() => api?.scrollTo(index)} type="button"/>)}</div><div className="flex gap-2"><CarouselPrevious className="static my-0"/><CarouselNext className="static my-0"/></div></div></Carousel><DialogFooter className="border-t px-7 py-5 sm:px-12"><Button onClick={finish}>{current === slides.length - 1 ? <CheckCircle2 data-icon="inline-start"/> : null}{current === slides.length - 1 ? "Start using Litera" : "Skip tutorial"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function hasCompletedOnboarding() { return typeof window !== "undefined" && localStorage.getItem(onboardingKey) === "true"; }

export function HelpDialog({ open, onOpenChange, onTutorial }: { open: boolean; onOpenChange: (open: boolean) => void; onTutorial: () => void }) {
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><HelpCircle/>Litera help</DialogTitle><DialogDescription>Clear guidance for working locally from source book to accessible release.</DialogDescription></DialogHeader><div className="grid gap-6 py-4"><DocumentationSection number="01" title="Create or reopen a book">Import a PDF to begin, or open an EPUB, Web Publication, or ZIP project to continue work that already passed through a compatible publishing pipeline.</DocumentationSection><DocumentationSection number="02" title="Work stage by stage">Choose a stage from the colored pipeline. Litera preserves completed work so corrections can begin at the exact stage that needs attention.</DocumentationSection><DocumentationSection number="03" title="Configure AI providers">Open Settings, create a local vault password, and add only the provider keys you intend to use. The password is never stored.</DocumentationSection><DocumentationSection number="04" title="Assign signed videos">Open the Sign language stage, add video files, then map them to the relevant pages or sections before validation.</DocumentationSection><DocumentationSection number="05" title="Update Litera">The top-bar update control checks signed release metadata. It becomes an install action only when a newer verified package exists.</DocumentationSection></div><DialogFooter><Button onClick={() => { onOpenChange(false); onTutorial(); }} variant="outline">Take the tutorial again</Button></DialogFooter></DialogContent></Dialog>;
}

function DocumentationSection({ children, number, title }: { children: React.ReactNode; number: string; title: string }) { return <section className="grid gap-2 border-b pb-5 last:border-0"><span className="font-mono text-xs text-primary">{number}</span><h3 className="text-lg font-semibold">{title}</h3><p className="leading-7 text-muted-foreground">{children}</p></section>; }

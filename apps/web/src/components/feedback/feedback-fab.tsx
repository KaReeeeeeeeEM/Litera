"use client";

import { useEffect, useRef, useState } from "react";
import { Accessibility, ArrowLeft, ArrowRight, Bug, Check, Heart, ImagePlus, Lightbulb, LoaderCircle, MessageSquareText, Paperclip, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const categories = [
  { value: "issue", label: "Report an issue", description: "Something is broken or confusing.", icon: Bug },
  { value: "idea", label: "Share an idea", description: "Suggest an improvement or feature.", icon: Lightbulb },
  { value: "accessibility", label: "Accessibility", description: "Tell us about an access barrier.", icon: Accessibility },
  { value: "compliment", label: "Share appreciation", description: "Let the team know what works well.", icon: Heart },
] as const;

type Category = (typeof categories)[number]["value"];
type FeedbackDraft = { category: Category | ""; title: string; description: string; email: string };
type Position = { x: number; y: number } | null;

const initialDraft: FeedbackDraft = { category: "", title: "", description: "", email: "" };
const stepLabels = ["Kind of feedback", "Tell us more", "Add screenshots", "Review and send"];

export function FeedbackFab() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FeedbackDraft>(initialDraft);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [position, setPosition] = useState<Position>(null);
  const [error, setError] = useState("");
  const drag = useRef<{ offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);
  const dragged = useRef(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("litera-feedback-fab-position");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Position;
      if (parsed) {
        const frame = window.requestAnimationFrame(() => setPosition(clampFabPosition(parsed.x, parsed.y, fabRef.current?.offsetWidth)));
        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      window.localStorage.removeItem("litera-feedback-fab-position");
    }
  }, []);

  useEffect(() => {
    function keepInView() {
      setPosition((current) => current ? clampFabPosition(current.x, current.y, fabRef.current?.offsetWidth) : current);
    }
    window.addEventListener("resize", keepInView);
    return () => window.removeEventListener("resize", keepInView);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const distance = Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY);
    if (distance < 5 && !dragged.current) return;
    dragged.current = true;
    setPosition(clampFabPosition(event.clientX - drag.current.offsetX, event.clientY - drag.current.offsetY, fabRef.current?.offsetWidth));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (position) window.localStorage.setItem("litera-feedback-fab-position", JSON.stringify(position));
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resetFlow() {
    setStep(0);
    setDraft(initialDraft);
    setScreenshots([]);
    setError("");
  }

  function validateStep() {
    if (step === 0 && !draft.category) return "Choose the kind of feedback you want to share.";
    if (step === 1 && draft.title.trim().length < 3) return "Add a short title with at least 3 characters.";
    if (step === 1 && draft.description.trim().length < 10) return "Add a little more detail so we can understand the feedback.";
    if (step === 1 && draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) return "Enter a valid email address or leave it blank.";
    return "";
  }

  function goNext() {
    const message = validateStep();
    if (message) return setError(message);
    setError("");
    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
  }

  function addScreenshots(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    const next = [...screenshots, ...incoming].slice(0, 3);
    const totalSize = next.reduce((sum, file) => sum + file.size, 0);
    if (incoming.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type)) || next.some((file) => file.size > 3 * 1024 * 1024) || totalSize > 4 * 1024 * 1024) {
      setError("Use up to 3 PNG, JPG, or WebP images with a combined size below 4 MB.");
      event.target.value = "";
      return;
    }
    setScreenshots(next);
    setError("");
    event.target.value = "";
  }

  async function submitFeedback() {
    setPending(true);
    setError("");
    const data = new FormData();
    Object.entries(draft).forEach(([key, value]) => data.append(key, value));
    data.append("page", window.location.href);
    data.append("website", "");
    screenshots.forEach((file) => data.append("screenshots", file));

    try {
      const response = await fetch("/api/feedback", { method: "POST", body: data });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Your feedback could not be sent.");
      toast.success(result.message || "Thank you for helping Litera improve.");
      setOpen(false);
      resetFlow();
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Your feedback could not be sent.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const selectedCategory = categories.find((category) => category.value === draft.category);

  return (
    <>
      <Button
        aria-label="Give feedback — drag to reposition"
        className={cn("fixed z-40 size-13 touch-none cursor-grab rounded-full shadow-lg transition-shadow hover:shadow-xl active:cursor-grabbing", position ? "" : "bottom-5 right-5")}
        onClick={() => { if (!dragged.current) setOpen(true); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={() => { drag.current = null; }}
        onPointerUp={handlePointerUp}
        ref={fabRef}
        size="icon-lg"
        style={position ? { left: position.x, top: position.y } : undefined}
        title="Give feedback"
        type="button"
      >
        <MessageSquareText />
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen && !pending) setError(""); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader className="pr-10">
            <div className="flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
              <span>Feedback</span>
              <span>Step {step + 1} of {stepLabels.length}</span>
            </div>
            <Progress aria-label={`Feedback progress: step ${step + 1} of ${stepLabels.length}`} value={((step + 1) / stepLabels.length) * 100} />
            <DialogTitle className="pt-2 text-xl">{stepLabels[step]}</DialogTitle>
            <DialogDescription>{step === 0 ? "Your perspective helps us make Litera calmer, clearer, and more inclusive." : step === 1 ? "Share enough context for the team to understand and reproduce your experience." : step === 2 ? "Screenshots are optional, but they can help us see exactly what you saw." : "Check everything before your feedback is sent to the Litera team."}</DialogDescription>
          </DialogHeader>

          <div className="py-1">
            {step === 0 ? (
              <FieldSet>
                <FieldLegend className="sr-only">Feedback category</FieldLegend>
                <ToggleGroup className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2" onValueChange={(value) => { if (value) setDraft((current) => ({ ...current, category: value as Category })); setError(""); }} type="single" value={draft.category} variant="outline">
                  {categories.map(({ value, label, description, icon: Icon }) => (
                    <ToggleGroupItem className="h-auto min-h-20 w-full items-start justify-start whitespace-normal p-4 text-left transition-colors hover:border-primary/30 data-[state=on]:border-primary/30 data-[state=on]:bg-primary/5" key={value} value={value}>
                      <Icon className="mt-0.5" />
                      <span className="flex flex-col gap-1"><strong>{label}</strong><span className="font-normal text-muted-foreground">{description}</span></span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            ) : null}

            {step === 1 ? (
              <FieldGroup>
                <Field data-invalid={Boolean(error && draft.title.trim().length < 3)}>
                  <FieldLabel htmlFor="feedback-title">Short title</FieldLabel>
                  <Input aria-invalid={Boolean(error && draft.title.trim().length < 3)} id="feedback-title" maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Briefly describe your feedback" value={draft.title} />
                </Field>
                <Field data-invalid={Boolean(error && draft.description.trim().length < 10)}>
                  <FieldLabel htmlFor="feedback-description">What happened, or what would you like to see?</FieldLabel>
                  <Textarea aria-invalid={Boolean(error && draft.description.trim().length < 10)} className="min-h-32 resize-y" id="feedback-description" maxLength={4000} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Tell us what you were doing, what you expected, and what would make the experience better." value={draft.description} />
                  <FieldDescription>{draft.description.length}/4000 characters</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="feedback-email">Email address <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                  <Input autoComplete="email" id="feedback-email" onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" type="email" value={draft.email} />
                  <FieldDescription>Include this only if you would like the team to follow up.</FieldDescription>
                </Field>
              </FieldGroup>
            ) : null}

            {step === 2 ? (
              <FieldGroup>
                <Field>
                  <FieldLabel className="w-full cursor-pointer rounded-xl border border-dashed p-6 transition-colors hover:border-primary/30 hover:bg-primary/5" htmlFor="feedback-screenshots">
                    <span className="flex flex-col items-center gap-3 text-center"><ImagePlus className="size-7 text-primary" /><span className="font-semibold">Attach screenshots or captures</span><span className="font-normal text-muted-foreground">PNG, JPG, or WebP · up to 3 images · 4 MB combined</span></span>
                  </FieldLabel>
                  <Input accept="image/png,image/jpeg,image/webp" className="sr-only" id="feedback-screenshots" multiple onChange={addScreenshots} type="file" />
                </Field>
                {screenshots.length ? <ul className="flex flex-col gap-2">{screenshots.map((file, index) => <li className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3" key={`${file.name}-${file.lastModified}`}><Paperclip className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span><Button aria-label={`Remove ${file.name}`} onClick={() => setScreenshots((current) => current.filter((_, itemIndex) => itemIndex !== index))} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button></li>)}</ul> : <p className="text-center text-sm text-muted-foreground">No screenshots attached yet. You can continue without one.</p>}
              </FieldGroup>
            ) : null}

            {step === 3 ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border bg-muted/30 p-5"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{selectedCategory ? <selectedCategory.icon className="size-4" /> : null}</span><div><p className="font-semibold">{selectedCategory?.label}</p><p className="text-sm text-muted-foreground">{draft.title}</p></div></div></div>
                <div className="rounded-xl border p-5"><p className="whitespace-pre-wrap text-sm leading-7">{draft.description}</p></div>
                <div className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-lg border p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Follow-up</p><p className="mt-2 truncate">{draft.email || "No email provided"}</p></div><div className="rounded-lg border p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Attachments</p><p className="mt-2">{screenshots.length ? `${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}` : "None"}</p></div></div>
                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" />The current page address will be included automatically to help the team understand the context.</p>
              </div>
            ) : null}

            {error ? <FieldError className="mt-4">{error}</FieldError> : null}
          </div>

          <DialogFooter>
            {step > 0 ? <Button disabled={pending} onClick={() => { setStep((current) => current - 1); setError(""); }} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />Back</Button> : <Button onClick={() => { setOpen(false); resetFlow(); }} type="button" variant="outline">Cancel</Button>}
            {step < stepLabels.length - 1 ? <Button onClick={goNext} type="button">Continue<ArrowRight data-icon="inline-end" /></Button> : <Button disabled={pending} onClick={submitFeedback} type="button">{pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}{pending ? "Sending…" : "Send feedback"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clampFabPosition(x: number, y: number, measuredSize = 52) {
  const margin = 16;
  return { x: Math.min(Math.max(margin, x), window.innerWidth - measuredSize - margin), y: Math.min(Math.max(margin, y), window.innerHeight - measuredSize - margin) };
}

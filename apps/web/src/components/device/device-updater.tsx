"use client";

import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type UpdateHandle = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater")["check"]>>;
type UpdateState = "checking" | "current" | "available" | "installing" | "unavailable";

type ParsedReleaseNotes = {
  introduction?: string;
  highlights: string[];
  upgrade?: string;
};

function parseReleaseNotes(body?: string | null): ParsedReleaseNotes {
  if (!body)
    return {
      highlights: [
        "A newer signed version of Litera is available with improvements and reliability fixes.",
      ],
    };
  const notes: ParsedReleaseNotes = { highlights: [] };
  let section = "";
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (heading) {
      section = heading.toLocaleLowerCase();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)?.[1]?.trim();
    const clean = (bullet ?? line).replace(/\*\*(.*?)\*\*/g, "$1");
    if (/upgrade|install|update/.test(section)) {
      notes.upgrade = [notes.upgrade, clean].filter(Boolean).join(" ");
    } else if (bullet || /highlight|what'?s new|improvement|fix/.test(section)) {
      notes.highlights.push(clean);
    } else if (!notes.introduction) {
      notes.introduction = clean;
    }
  }
  if (!notes.highlights.length && notes.introduction) {
    notes.highlights.push(notes.introduction);
    notes.introduction = undefined;
  }
  return notes;
}

function featureTitle(highlight: string) {
  if (/re-?render/i.test(highlight)) return "Reliable page re-rendering";
  if (/storyboard|memory|computer|performance/i.test(highlight))
    return "Smoother storyboarding";
  if (/caption|figure|image description/i.test(highlight))
    return "Resilient image captions";
  if (/table of contents|contents|navigation/i.test(highlight))
    return "Better book navigation";
  if (/reader|bottom bar|dock|preview/i.test(highlight))
    return "Improved reading controls";
  return "Product improvement";
}

export function DeviceUpdater() {
  const [state, setState] = useState<UpdateState>("checking");
  const [update, setUpdate] = useState<UpdateHandle>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const checkForUpdate = useCallback(async (announce = true) => {
    setState("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const result = await check();
      setUpdate(result);
      setState(result ? "available" : "current");
      if (result) setOpen(true);
      else if (announce) toast.success("Litera is up to date.");
    } catch {
      setState("unavailable");
      if (announce) toast.error("Update checking is available in the installed Litera application.");
    }
  }, []);

  useEffect(() => { const frame = window.requestAnimationFrame(() => void checkForUpdate(false)); return () => window.cancelAnimationFrame(frame); }, [checkForUpdate]);

  async function install() {
    if (!update) return;
    setState("installing");
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event === "Finished") setProgress(100);
        else if (total) setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setState("available");
      toast.error("The signed update could not be installed. Please try again.");
    }
  }

  const label = state === "checking" ? "Checking…" : state === "available" ? `Update to ${update?.version}` : state === "current" ? "Up to date" : "Check for updates";
  const releaseNotes = parseReleaseNotes(update?.body);

  return (
    <>
      <Button
        disabled={state === "checking" || state === "installing"}
        onClick={() =>
          state === "available" ? setOpen(true) : void checkForUpdate()
        }
        size="sm"
        variant={state === "available" ? "default" : "outline"}
      >
        {state === "checking" ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : state === "available" ? (
          <Download data-icon="inline-start" />
        ) : state === "current" ? (
          <CheckCircle2 data-icon="inline-start" />
        ) : (
          <RefreshCw data-icon="inline-start" />
        )}
        {label}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="overflow-hidden p-0 sm:!max-w-5xl">
          <DialogHeader className="px-6 pt-6 sm:px-8 sm:pt-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <Sparkles data-icon="inline-start" />
                New update
              </Badge>
              {update?.version ? (
                <Badge variant="outline">Version {update.version}</Badge>
              ) : null}
            </div>
            <DialogTitle className="text-2xl sm:text-3xl">
              A better Litera is ready
            </DialogTitle>
            <DialogDescription className="max-w-3xl text-base">
              {releaseNotes.introduction ??
                "Install the latest signed release to get these improvements."}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[min(58dvh,34rem)] px-6 sm:px-8">
            <div className="flex flex-col gap-5 py-5">
              <section aria-labelledby="update-highlights">
                <div className="mb-3 flex items-center gap-2">
                  <Rocket />
                  <h3 className="font-semibold" id="update-highlights">
                    What’s improved
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {releaseNotes.highlights.map((highlight, index) => (
                    <Card key={`${index}-${highlight}`} size="sm">
                      <CardHeader>
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <CardTitle>{featureTitle(highlight)}</CardTitle>
                            <CardDescription className="mt-1 text-pretty leading-6">
                              {highlight}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </section>

              {releaseNotes.upgrade ? (
                <Alert>
                  <ShieldCheck />
                  <AlertTitle>Safe upgrade</AlertTitle>
                  <AlertDescription>{releaseNotes.upgrade}</AlertDescription>
                </Alert>
              ) : null}

              {state === "installing" ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Downloading and verifying</CardTitle>
                    <CardDescription>
                      Litera will relaunch after the signed update is installed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Installation progress</span>
                      <strong>{progress}%</strong>
                    </div>
                    <Progress className="pipeline-progress" value={progress} />
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </ScrollArea>

          <Separator />
          <DialogFooter className="px-6 py-4 sm:px-8">
            <Button
              disabled={state === "installing"}
              onClick={() => setOpen(false)}
              variant="outline"
            >
              Remind me later
            </Button>
            <Button disabled={state === "installing"} onClick={() => void install()}>
              {state === "installing" ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              {state === "installing" ? "Installing…" : "Download and install"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

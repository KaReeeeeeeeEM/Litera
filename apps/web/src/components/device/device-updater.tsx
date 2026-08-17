"use client";

import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type UpdateHandle = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater")["check"]>>;
type UpdateState = "checking" | "current" | "available" | "installing" | "unavailable";

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
  return <><Button disabled={state === "checking" || state === "installing"} onClick={() => state === "available" ? setOpen(true) : void checkForUpdate()} size="sm" variant={state === "available" ? "default" : "outline"}>{state === "checking" ? <Loader2 className="animate-spin" data-icon="inline-start"/> : state === "available" ? <Download data-icon="inline-start"/> : state === "current" ? <CheckCircle2 data-icon="inline-start"/> : <RefreshCw data-icon="inline-start"/>}{label}</Button><Dialog onOpenChange={setOpen} open={open}><DialogContent className="sm:!max-w-5xl"><DialogHeader><DialogTitle>Litera {update?.version} is ready</DialogTitle><DialogDescription>{update?.body || "A newer signed version of Litera is available."}</DialogDescription></DialogHeader>{state === "installing" ? <div className="grid gap-3 py-4"><div className="flex items-center justify-between text-sm"><span>Downloading and verifying</span><strong>{progress}%</strong></div><Progress className="pipeline-progress" value={progress}/></div> : null}<DialogFooter><Button disabled={state === "installing"} onClick={() => void install()}>{state === "installing" ? <Loader2 className="animate-spin" data-icon="inline-start"/> : <Download data-icon="inline-start"/>}{state === "installing" ? "Installing…" : "Download and install"}</Button></DialogFooter></DialogContent></Dialog></>;
}

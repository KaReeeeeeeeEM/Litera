"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function DesktopUpdateControl() {
  const desktop = useSyncExternalStore(
    () => () => undefined,
    () => "__TAURI_INTERNALS__" in window,
    () => false,
  );
  const [checking, setChecking] = useState(false);

  async function checkForUpdate() {
    setChecking(true);
    try {
      const [{ check }, { relaunch }] = await Promise.all([
        import("@tauri-apps/plugin-updater"),
        import("@tauri-apps/plugin-process"),
      ]);
      const update = await check();

      if (!update) {
        toast.success("Litera Desktop is up to date.");
        return;
      }

      toast.info(`Litera Desktop ${update.version} is ready. Downloading the signed update…`);
      await update.downloadAndInstall((event) => {
        if (event.event === "Finished") toast.success("Update installed. Litera will restart now.");
      });
      await relaunch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The update could not be installed.");
    } finally {
      setChecking(false);
    }
  }

  if (!desktop) return <Button asChild><a href="https://github.com/KaReeeeeeeeEM/Litera/releases/latest"><Download />View latest release</a></Button>;

  return <Button disabled={checking} onClick={checkForUpdate}>{checking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{checking ? "Checking…" : "Check for updates"}</Button>;
}

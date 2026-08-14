"use client";

import { Check, Download } from "lucide-react";
import { useSyncExternalStore } from "react";
import { FaAndroid, FaApple, FaLinux, FaWindows } from "react-icons/fa6";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { installerFor, type DesktopRelease, type ReleasePlatform } from "@/lib/github-releases";
import { cn } from "@/lib/utils";

type PlatformOption = { name: ReleasePlatform; detail: string; requirement: string; icon: typeof FaApple };

const desktopPlatforms: PlatformOption[] = [
  { name: "macOS", detail: "Apple Silicon and Intel", requirement: "macOS 11 or later", icon: FaApple },
  { name: "Windows", detail: "64-bit installer", requirement: "Windows 10 or later", icon: FaWindows },
  { name: "Linux", detail: "AppImage and Debian package", requirement: "Modern 64-bit distribution", icon: FaLinux },
];

const mobilePlatforms: PlatformOption[] = [
  { name: "Android", detail: "Installable APK", requirement: "Android 7.0 or later", icon: FaAndroid },
  { name: "iOS", detail: "Native iPhone and iPad package", requirement: "iOS 14 or later · signing pending", icon: FaApple },
];

function detectPlatform(): ReleasePlatform | null {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  if (userAgent.includes("android")) return "Android";
  if (/iphone|ipad|ipod/.test(userAgent) || (platform.includes("mac") && navigator.maxTouchPoints > 1)) return "iOS";
  if (platform.includes("win") || userAgent.includes("windows")) return "Windows";
  if (platform.includes("mac") || userAgent.includes("macintosh")) return "macOS";
  if (platform.includes("linux") || userAgent.includes("linux")) return "Linux";
  return null;
}

function subscribeToPlatform() {
  return () => undefined;
}

function PlatformGrid({ detected, platforms, release, columns }: { detected: ReleasePlatform | null; platforms: PlatformOption[]; release: DesktopRelease; columns: string }) {
  return <div className={cn("grid gap-5", columns)}>{platforms.map(({ detail, icon: Icon, name, requirement }) => {
    const installer = installerFor(release, name);
    const recommended = detected === name;
    return <Card aria-label={recommended ? `Litera for ${name}, recommended for this device` : `Litera for ${name}`} className={cn("motion-card h-full gap-0 py-0 transition-colors", recommended && "bg-primary/[.03] ring-primary/30")} key={name}>
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon aria-hidden="true" className="size-6 text-primary" /></div>
          <div><CardTitle className="text-xl">Litera for {name}</CardTitle><CardDescription className="mt-1">{detail}</CardDescription></div>
        </div>
        {recommended ? <CardAction><Badge>Recommended</Badge></CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-6 pb-6"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" />{requirement}</p>{installer ? <Button asChild className="mt-auto w-full"><a href={installer.browser_download_url}>Quick download<Download data-icon="inline-end"/><span className="sr-only"> Litera for {name}</span></a></Button> : <Button className="mt-auto w-full" disabled>Package coming soon</Button>}</CardContent>
    </Card>;
  })}</div>;
}

export function PlatformDownloadGroups({ release }: { release: DesktopRelease }) {
  const detected = useSyncExternalStore(subscribeToPlatform, detectPlatform, () => null);

  return <div className="flex flex-col gap-14">
    <div>
      <div className="mb-6"><Badge variant="secondary">Desktop</Badge><h3 className="mt-3 text-2xl font-semibold tracking-tight">Desktop applications</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Focused installers for laptops and workstations.</p></div>
      <PlatformGrid columns="md:grid-cols-2 xl:grid-cols-3" detected={detected} platforms={desktopPlatforms} release={release} />
    </div>
    <div className="border-t pt-10">
      <div className="mb-6"><Badge variant="secondary">Mobile</Badge><h3 className="mt-3 text-2xl font-semibold tracking-tight">Mobile applications</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Carry reviews, narration, and publishing activity onto phones and tablets.</p></div>
      <PlatformGrid columns="md:grid-cols-2" detected={detected} platforms={mobilePlatforms} release={release} />
    </div>
  </div>;
}

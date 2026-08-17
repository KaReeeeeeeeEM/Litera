"use client";

import { Monitor, RefreshCw, Smartphone } from "lucide-react";
import { useState } from "react";
import type { DeviceBook } from "@/components/device/device-types";
import { stages } from "@/components/device/device-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function BookBrowserPreview({ book }: { book: DeviceBook }) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const stage = stages.find(item => item.slug === (book.currentStage ?? "extract")) ?? stages[0];
  const font = book.conversionConfig?.typography === "custom" ? book.conversionConfig.fontFamily : undefined;
  return <Card className="h-fit overflow-hidden xl:sticky xl:top-24"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Browser preview</CardTitle><CardDescription className="mt-1">Live rendering at the {stage.label.toLowerCase()} stage.</CardDescription></div><Badge variant="secondary">Preview</Badge></div></CardHeader><CardContent><div className="mb-3 flex items-center justify-between"><div className="flex gap-1"><Button aria-label="Desktop preview" onClick={() => setViewport("desktop")} size="icon-sm" variant={viewport === "desktop" ? "secondary" : "ghost"}><Monitor/></Button><Button aria-label="Mobile preview" onClick={() => setViewport("mobile")} size="icon-sm" variant={viewport === "mobile" ? "secondary" : "ghost"}><Smartphone/></Button></div><Button aria-label="Refresh preview" size="icon-sm" variant="ghost"><RefreshCw/></Button></div><div className="overflow-hidden rounded-2xl border bg-muted/40 p-3"><div className={cn("mx-auto overflow-hidden rounded-xl border bg-background shadow-sm transition-all", viewport === "mobile" ? "max-w-48" : "w-full")}><div className="flex h-8 items-center gap-1.5 border-b px-3"><span className="size-1.5 rounded-full bg-destructive"/><span className="size-1.5 rounded-full bg-warning"/><span className="size-1.5 rounded-full bg-success"/><span className="ml-2 truncate text-[8px] text-muted-foreground">litera.local/preview</span></div><article className="min-h-80 p-4" style={{ fontFamily: font ? `"${font}", sans-serif` : undefined }}><span className="text-[8px] font-semibold uppercase tracking-wider text-primary">{stage.label}</span><h2 className="mt-2 text-lg font-semibold leading-tight">{book.name.replace(/\.[^.]+$/, "")}</h2><p className="mt-3 text-[9px] leading-4 text-muted-foreground">This panel follows the current conversion stage so layout, typography, activities, and accessibility can be reviewed before export.</p><div className="mt-4 aspect-video rounded-lg bg-primary/10"/><div className="mt-4 grid gap-2"><span className="h-1.5 w-full rounded bg-muted"/><span className="h-1.5 w-5/6 rounded bg-muted"/><span className="h-1.5 w-2/3 rounded bg-muted"/></div>{book.conversionConfig?.extractExercises ? <div className="mt-4 rounded-lg border border-dashed p-3"><strong className="text-[9px]">Activity</strong><div className="mt-2 h-9 rounded border bg-muted/20"/></div> : null}</article></div></div></CardContent></Card>;
}

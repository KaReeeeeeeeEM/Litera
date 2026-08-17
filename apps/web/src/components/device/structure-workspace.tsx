"use client";

import { ArrowLeft, Check, ImageIcon, ListChecks, PanelsTopLeft, RefreshCw, Save } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { ActivityType, DeviceBook, StructuredActivity, StructuredPage, StructuredSection } from "@/components/device/device-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/feedback";
import { structurePageText } from "@/lib/device-pipeline/structure-engine";

type Props = {
  book: DeviceBook;
  onChange: (book: DeviceBook, summary?: string) => Promise<void>;
};

const sectionKinds: Array<{ value: StructuredSection["kind"]; label: string }> = [
  { value: "heading", label: "Heading" },
  { value: "paragraph", label: "Paragraph" },
  { value: "list-item", label: "List item" },
  { value: "image", label: "Image or figure" },
];
const activityTypes: Array<{ value: ActivityType; label: string }> = [
  { value: "short-answer", label: "Short answer" },
  { value: "multiple-choice", label: "Multiple choice" },
  { value: "true-false", label: "True or false" },
  { value: "fill-blank", label: "Fill in the blank" },
  { value: "matching", label: "Matching" },
  { value: "drawing", label: "Drawing" },
  { value: "discussion", label: "Discussion" },
  { value: "no-input", label: "No input (oral/physical)" },
];

export function StructureWorkspace({ book, onChange }: Props) {
  const [selectedPage, setSelectedPage] = useState<number>();
  const pages = book.structuredPages ?? [];
  const selected = pages.find((page) => page.pageNumber === selectedPage);
  const activities = pages.flatMap((page) => page.activities ?? []);

  async function savePage(page: StructuredPage, summary: string) {
    await onChange({ ...book, structuredPages: pages.map((candidate) => candidate.pageNumber === page.pageNumber ? page : candidate) }, summary);
  }

  async function resection(pageNumber: number) {
    const extracted = book.extractedPages?.find((page) => page.number === pageNumber);
    if (!extracted) return toast.error("The extracted source for this page is unavailable.");
    const revised = structurePageText(pageNumber, extracted.text ?? "", extracted.layoutBlocks);
    await savePage(revised, `Re-sectioned page ${pageNumber}`);
    toast.success(`Page ${pageNumber} was sectioned again without changing other pages.`);
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{selected ? `Page ${selected.pageNumber} structure` : "Structure workspace"}</CardTitle>
            <CardDescription className="mt-1">{selected ? "Review reading order, semantic roles, media, and activities for this page." : `${pages.length} of ${book.extractedPages?.length ?? 0} pages sectioned and persisted.`}</CardDescription>
          </div>
          {selected ? <Button onClick={() => setSelectedPage(undefined)} variant="outline"><ArrowLeft data-icon="inline-start"/>All pages</Button> : null}
        </div>
      </CardHeader>
      <CardContent>
        {selected ? (
          <StructurePageEditor book={book} key={`${selected.pageNumber}-${selected.structuredAt}`} onResection={() => void resection(selected.pageNumber)} onSave={(page) => void savePage(page, `Edited structure for page ${page.pageNumber}`)} page={selected}/>
        ) : (
          <Tabs defaultValue="pages">
            <TabsList variant="line"><TabsTrigger value="pages"><PanelsTopLeft/>Pages</TabsTrigger><TabsTrigger value="activities"><ListChecks/>Activities <Badge variant="secondary">{activities.length}</Badge></TabsTrigger></TabsList>
            <TabsContent className="pt-5" value="pages">
              {pages.length ? <ScrollArea className="h-[calc(100vh-18rem)] min-h-80 max-h-[42rem] pr-4"><div className="grid gap-4 lg:grid-cols-2">{pages.map((page) => <button className="rounded-xl border bg-background p-5 text-left transition-colors hover:border-primary/30" key={page.pageNumber} onClick={() => setSelectedPage(page.pageNumber)} type="button"><div className="flex items-center justify-between gap-3"><Badge variant="outline">Page {page.pageNumber}</Badge><span className="text-xs text-muted-foreground">{page.sections.length} sections · {(page.activities ?? []).length} activities</span></div><h2 className="mt-4 line-clamp-2 text-lg font-semibold">{page.title}</h2><div className="mt-4 flex flex-col gap-2">{page.sections.slice(0, 4).map((section) => <div className="flex items-start gap-2 text-sm" key={section.id}><Badge className="mt-0.5 shrink-0" variant="secondary">{section.kind}</Badge><span className="line-clamp-2 text-muted-foreground">{section.text}</span></div>)}</div></button>)}</div></ScrollArea> : <StructureEmpty/>}
            </TabsContent>
            <TabsContent className="pt-5" value="activities">
              {activities.length ? <ScrollArea className="h-[calc(100vh-18rem)] min-h-80 max-h-[42rem] pr-4"><div className="flex flex-col gap-4">{activities.map((activity) => <ActivityEditor activity={activity} book={book} key={activity.id} onSave={(next) => { const page = pages.find((candidate) => candidate.pageNumber === next.pageNumber); if (!page) return; void savePage({ ...page, activities: (page.activities ?? []).map((candidate) => candidate.id === next.id ? next : candidate) }, `Updated activity on page ${next.pageNumber}`); }}/>)}</div></ScrollArea> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed text-center"><div><ListChecks className="mx-auto text-muted-foreground"/><p className="mt-3 font-medium">No activities detected</p><p className="mt-1 text-sm text-muted-foreground">Re-section a page after confirming that its extracted text contains an exercise or question.</p></div></div>}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function StructurePageEditor({ book, onResection, onSave, page }: { book: DeviceBook; onResection: () => void; onSave: (page: StructuredPage) => void; page: StructuredPage }) {
  const [draft, setDraft] = useState(page);
  const thumbnail = book.extractedPages?.find((item) => item.number === page.pageNumber)?.thumbnail;
  const imageUrl = useObjectUrl(thumbnail);
  function updateSection(id: string, update: Partial<StructuredSection>) { setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? { ...section, ...update } : section) })); }
  return <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]"><Card className="min-w-0 overflow-hidden"><CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon/>Source page and media</CardTitle><CardDescription>Visual reference stays beside the editable reading structure.</CardDescription></CardHeader><CardContent>{imageUrl ? <div className="relative mx-auto aspect-[3/4] w-full max-w-[22rem] overflow-hidden rounded-xl border bg-muted/20"><Image alt={`Source page ${page.pageNumber}`} className="object-contain" fill sizes="352px" src={imageUrl} unoptimized/></div> : <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">No page image available</div>}</CardContent></Card><div className="min-w-0"><div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><h3 className="text-lg font-semibold">Reading order</h3><p className="text-sm text-muted-foreground">Edit text, roles, and image descriptions in sequence.</p></div><div className="flex flex-wrap gap-2"><Button className="flex-1 sm:flex-none" onClick={onResection} variant="outline"><RefreshCw data-icon="inline-start"/>Re-section page</Button><Button className="flex-1 sm:flex-none" onClick={() => { onSave({ ...draft, structuredAt: new Date().toISOString() }); toast.success(`Page ${page.pageNumber} structure saved.`); }}><Save data-icon="inline-start"/>Save changes</Button></div></div><ScrollArea className="mt-5 h-[clamp(22rem,calc(100dvh-22rem),46rem)] min-h-0 pr-4"><FieldGroup>{draft.sections.map((section, index) => <Field className="min-w-0 rounded-xl border p-4" key={section.id}><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><FieldLabel>Section {index + 1}</FieldLabel><SearchableSelect className="w-full sm:w-48" onValueChange={(kind) => updateSection(section.id, { kind: kind as StructuredSection["kind"] })} options={sectionKinds} placeholder="Search section roles…" value={section.kind}/></div><Textarea className="min-w-0 resize-y" aria-label={`Section ${index + 1} text`} onChange={(event) => updateSection(section.id, { text: event.target.value })} value={section.text}/>{section.kind === "image" ? <><FieldLabel htmlFor={`${section.id}-alt`}>Image description</FieldLabel><Textarea className="min-w-0 resize-y" id={`${section.id}-alt`} onChange={(event) => updateSection(section.id, { altText: event.target.value })} placeholder="Describe the purpose and meaningful visual information for readers who cannot see the image." value={section.altText ?? ""}/></> : null}</Field>)}</FieldGroup></ScrollArea></div></div>;
}

function ActivityEditor({ activity, book, onSave }: { activity: StructuredActivity; book: DeviceBook; onSave: (activity: StructuredActivity) => void }) {
  const [draft, setDraft] = useState(activity);
  return <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Page {activity.pageNumber}</CardTitle><CardDescription className="mt-1">{Math.round(activity.confidence * 100)}% detection confidence · review before publishing</CardDescription></div><SearchableSelect className="sm:w-56" onValueChange={(type) => setDraft((current) => ({ ...current, type: type as ActivityType }))} options={activityTypes} placeholder="Search activity types…" value={draft.type}/></div></CardHeader><CardContent><div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]"><SourceRegionPreview book={book} bounds={activity.sourceBounds} pageNumber={activity.pageNumber}/><FieldGroup><Field><FieldLabel htmlFor={`${activity.id}-prompt`}>Detected activity</FieldLabel><Textarea id={`${activity.id}-prompt`} onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))} value={draft.prompt}/></Field><Field><FieldLabel>Accessible interaction</FieldLabel><FieldDescription>{draft.accessibilityHint}</FieldDescription></Field><div className="flex justify-end"><Button onClick={() => { onSave(draft); toast.success("Activity assignment saved."); }} size="sm"><Check data-icon="inline-start"/>Save activity</Button></div></FieldGroup></div></CardContent></Card>;
}

function SourceRegionPreview({ book, bounds, pageNumber }: { book: DeviceBook; bounds?: { x: number; y: number; w: number; h: number }; pageNumber: number }) {
  const page = book.extractedPages?.find((item) => item.number === pageNumber);
  const url = useObjectUrl(page?.thumbnail);
  if (!url) return <div className="grid aspect-[16/7] place-items-center bg-muted/30 text-xs text-muted-foreground">Source preview unavailable</div>;
  const width = page?.width ?? 1;
  const height = page?.height ?? 1;
  const region = bounds ?? { x: 0, y: 0, w: width, h: height };
  const backgroundSize = `${(width / Math.max(1, region.w)) * 100}% ${(height / Math.max(1, region.h)) * 100}%`;
  const backgroundPosition = `${region.x <= 0 ? 0 : (region.x / Math.max(1, width - region.w)) * 100}% ${region.y <= 0 ? 0 : (region.y / Math.max(1, height - region.h)) * 100}%`;
  return <div aria-label={`Source ${bounds ? "activity" : "page"} ${pageNumber}`} className="aspect-[16/7] border-b bg-white bg-no-repeat" role="img" style={{ backgroundImage: `url(${url})`, backgroundPosition, backgroundSize: bounds ? backgroundSize : "contain" }}/>
}

function StructureEmpty() { return <div className="grid min-h-56 place-items-center rounded-xl border border-dashed text-center"><div><PanelsTopLeft className="mx-auto text-muted-foreground"/><p className="mt-3 font-medium">No structured pages yet</p><p className="mt-1 text-sm text-muted-foreground">Run Structure to create editable page sections and activity assignments.</p></div></div>; }

function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { if (!blob) return; const next = URL.createObjectURL(blob); const timeout = window.setTimeout(() => setUrl(next), 0); return () => { window.clearTimeout(timeout); URL.revokeObjectURL(next); }; }, [blob]);
  return url;
}

"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  ImageIcon,
  LoaderCircle,
  Monitor,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Tablet,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DeviceBook,
  ExtractedPageAsset,
  StoryboardPage,
} from "@/components/device/device-types";
import type { ProviderKeys } from "@/components/device/provider-vault";
import {
  ImageEditorDialog,
  type BookImageAsset,
} from "@/components/device/image-editor-dialog";
import { HtmlSourceEditorDialog } from "@/components/device/html-source-editor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  hydrateStoryboardAssets,
  sanitizeStoryboardHtml,
} from "@/lib/device-pipeline/ai-storyboard-engine";
import { cn } from "@/lib/utils";
import { renderStoryboardHtml } from "@/lib/device-pipeline/storyboard-engine";
import { toast } from "@/lib/feedback";

type Props = {
  book: DeviceBook;
  onChange: (book: DeviceBook, summary?: string) => Promise<void>;
  onRerenderPage: (pageNumber: number, instructions?: string) => Promise<void>;
  rerenderingPages: number[];
  onPageRenderStateChange?: (ready: boolean) => void;
  providerKeys?: ProviderKeys;
};
type Viewport = "desktop" | "tablet" | "mobile";

export function StoryboardWorkspace({
  book,
  onChange,
  onRerenderPage,
  rerenderingPages,
  onPageRenderStateChange,
  providerKeys,
}: Props) {
  const pages = book.storyboardPages ?? [];
  const [pageIndex, setPageIndex] = useState(0);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [zoom, setZoom] = useState(100);
  const [editingHtml, setEditingHtml] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [editingPageSize, setEditingPageSize] = useState(false);
  const [pageWidth, setPageWidth] = useState("");
  const [pageHeight, setPageHeight] = useState("");
  const [reverting, setReverting] = useState(false);
  const [rerenderOpen, setRerenderOpen] = useState(false);
  const [locallyRerendering, setRerendering] = useState(false);
  const [hasRerenderFixes, setHasRerenderFixes] = useState<"yes" | "no">("no");
  const [rerenderInstructions, setRerenderInstructions] = useState("");
  const sourcePageNumbers = (book.extractedPages ?? [])
    .map((item) => item.number)
    .sort((a, b) => a - b);
  const totalPages = Math.max(sourcePageNumbers.length, pages.length);
  const selectedPageNumber = sourcePageNumbers[pageIndex];
  const page = pages.find(
    (candidate) => candidate.pageNumber === selectedPageNumber,
  );
  const pageAssets = book.extractedPages?.find(
    (item) => item.number === page?.pageNumber,
  )?.assets;
  const imageUrls = useObjectUrls(pageAssets);
  const previewData = usePagePreviews(book);
  const pageRevisions = (book.storyboardPageRevisions ?? [])
    .filter((revision) => revision.pageNumber === page?.pageNumber)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rerendering =
    locallyRerendering ||
    Boolean(page && rerenderingPages.includes(page.pageNumber));
  const bookImageAssets: BookImageAsset[] = (book.extractedPages ?? []).flatMap(
    (sourcePage) =>
      (sourcePage.assets ?? []).map((asset) => ({
        ...asset,
        pageNumber: sourcePage.number,
      })),
  );

  async function applyImageEdit(
    target: BookImageAsset,
    replacement: Blob,
    summary: string,
  ) {
    if (!page) return;
    const newId = `${target.id}-edit-${crypto.randomUUID().slice(0, 8)}`;
    const newAsset: ExtractedPageAsset = {
      id: newId,
      kind: "image",
      blob: replacement,
      bytes: await replacement.arrayBuffer(),
      bounds: target.bounds,
      containsText: target.containsText,
    };
    const escapedTarget = target.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextHtml = page.html.replace(
      new RegExp(`litera-asset://${escapedTarget}(?=[\"'()\\s<>]|$)`, "g"),
      `litera-asset://${newId}`,
    );
    const revision = {
      id: crypto.randomUUID(),
      pageNumber: page.pageNumber,
      createdAt: new Date().toISOString(),
      summary: `Before ${summary.toLowerCase()}`,
      page,
    };
    await onChange(
      {
        ...book,
        extractedPages: book.extractedPages?.map((sourcePage) =>
          sourcePage.number === page.pageNumber
            ? {
                ...sourcePage,
                assets: [...(sourcePage.assets ?? []), newAsset],
              }
            : sourcePage,
        ),
        storyboardPages: pages.map((storyboardPage) =>
          storyboardPage.pageNumber === page.pageNumber
            ? {
                ...storyboardPage,
                html: nextHtml,
                blocks: storyboardPage.blocks.map((block) =>
                  block.assetId === target.id
                    ? { ...block, assetId: newId }
                    : block,
                ),
                storyboardedAt: new Date().toISOString(),
              }
            : storyboardPage,
        ),
        storyboardPageRevisions: [
          ...(book.storyboardPageRevisions ?? []),
          revision,
        ],
      },
      summary,
    );
  }

  useEffect(() => {
    onPageRenderStateChange?.(Boolean(page) && !rerendering);
  }, [onPageRenderStateChange, page, rerendering]);

  useEffect(() => {
    const onAnswerFeedback = (event: MessageEvent) => {
      if (event.source !== document.querySelector<HTMLIFrameElement>("iframe")?.contentWindow) return;
      const data = event.data as { type?: string; correct?: number; incorrect?: number; checked?: number };
      if (data?.type !== "litera-answer-feedback" || !data.checked) return;
      const swahili = page?.html.includes("Wasilisha majibu");
      if ((data.incorrect ?? 0) > 0) {
        toast.error(swahili ? `${data.incorrect} bado si sahihi. Jaribu tena.` : `${data.incorrect} answer${data.incorrect === 1 ? " is" : "s are"} not correct yet. Try again.`);
      } else {
        toast.success(swahili ? "Hongera! Majibu yote ni sahihi." : "Well done! All checked answers are correct.");
      }
    };
    window.addEventListener("message", onAnswerFeedback);
    return () => window.removeEventListener("message", onAnswerFeedback);
  }, [page?.html]);

  async function restorePageRevision(
    revision: NonNullable<DeviceBook["storyboardPageRevisions"]>[number],
  ) {
    if (!page) return;
    const notice = toast.loading(`Restoring page ${page.pageNumber}…`);
    setReverting(false);
    const revisions = [
      ...(book.storyboardPageRevisions ?? []),
      {
        id: crypto.randomUUID(),
        pageNumber: page.pageNumber,
        createdAt: new Date().toISOString(),
        summary: `Before restoring revision from ${new Date(revision.createdAt).toLocaleString()}`,
        page,
      },
    ];
    try {
      await onChange(
        {
          ...book,
          storyboardPages: pages.map((item) =>
            item.pageNumber === page.pageNumber
              ? { ...revision.page, storyboardedAt: new Date().toISOString() }
              : item,
          ),
          storyboardPageRevisions: revisions,
        },
        `Restored page ${page.pageNumber} revision`,
      );
      toast.success(
        `Page ${page.pageNumber} was restored. The replaced version remains available.`,
        { id: notice },
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Page ${page.pageNumber} could not be restored.`,
        { id: notice },
      );
      setReverting(true);
    }
  }

  async function rerenderCurrentPage() {
    if (!page || rerendering) return;
    setRerenderOpen(false);
    setRerendering(true);
    try {
      await onRerenderPage(
        page.pageNumber,
        hasRerenderFixes === "yes" ? rerenderInstructions : undefined,
      );
      toast.success(`Page ${page.pageNumber} was re-rendered.`);
      setRerenderInstructions("");
      setHasRerenderFixes("no");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Page ${page.pageNumber} could not be re-rendered.`,
      );
    } finally {
      setRerendering(false);
    }
  }

  async function saveHtml(html: string) {
    if (!page) return;
    const sanitized = sanitizeStoryboardHtml(html);
    if (!/<main\b[^>]*data-litera-page/i.test(sanitized)) {
      toast.error(
        "The page HTML must contain a <main data-litera-page> element.",
      );
      return;
    }
    const revision = {
      id: crypto.randomUUID(),
      pageNumber: page.pageNumber,
      createdAt: new Date().toISOString(),
      summary: "Before editing page HTML",
      page,
    };
    await onChange(
      {
        ...book,
        storyboardPages: pages.map((item) =>
          item.pageNumber === page.pageNumber
            ? {
                ...page,
                html: sanitized,
                storyboardedAt: new Date().toISOString(),
              }
            : item,
        ),
        storyboardPageRevisions: [
          ...(book.storyboardPageRevisions ?? []),
          revision,
        ],
      },
      `Edited HTML source for page ${page.pageNumber}`,
    );
    setEditingHtml(false);
    toast.success(`HTML for page ${page.pageNumber} was saved.`);
  }

  async function savePageSize() {
    if (!page) return;
    const width = Number(pageWidth || page.sourceWidth);
    const height = Number(pageHeight || page.sourceHeight);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 100 ||
      height < 100
    ) {
      toast.error("Page width and height must both be at least 100 units.");
      return;
    }
    const sizeStyle = `<style id="litera-page-size">main[data-litera-page]{aspect-ratio:${width}/${height}!important}</style>`;
    const html = page.html
      .replace(/<style id="litera-page-size">[\s\S]*?<\/style>/i, "")
      .replace(/<\/head>/i, `${sizeStyle}</head>`);
    await onChange(
      {
        ...book,
        storyboardPages: pages.map((item) =>
          item.pageNumber === page.pageNumber
            ? {
                ...item,
                html,
                sourceWidth: width,
                sourceHeight: height,
                sourceAspectRatio: width / height,
                storyboardedAt: new Date().toISOString(),
              }
            : item,
        ),
      },
      `Changed page ${page.pageNumber} size to ${width} × ${height}`,
    );
    setEditingPageSize(false);
    toast.success(`Page ${page.pageNumber} size was updated.`);
  }

  const canvas = page ? (
    <StoryboardCanvas
      imageUrls={imageUrls}
      onEditHtml={() => setEditingHtml(true)}
      onEditImage={() => setEditingImage(true)}
      onEditPageSize={() => {
        setPageWidth(String(page.sourceWidth ?? 612));
        setPageHeight(String(page.sourceHeight ?? 792));
        setEditingPageSize(true);
      }}
      page={page}
      pageCount={totalPages}
      pageIndex={pageIndex}
      setPageIndex={setPageIndex}
      setViewport={setViewport}
      setZoom={setZoom}
      storyboardCss={book.storyboardCss}
      viewport={viewport}
      zoom={zoom}
    />
  ) : (
    <div className="grid h-full min-h-[38rem] place-items-center border-l text-sm text-muted-foreground">
      Source page {selectedPageNumber ?? pageIndex + 1} is waiting to render.
    </div>
  );

  return (
    <div className="mt-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Rendered storyboard</CardTitle>
              <CardDescription className="mt-1">
                Dimension-preserving accessible HTML with original page visuals.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {page ? (
                <Button
                  disabled={rerendering}
                  onClick={() => setRerenderOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  {rerendering ? (
                    <LoaderCircle
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <RefreshCw data-icon="inline-start" />
                  )}
                  Re-render page
                </Button>
              ) : null}
              {pageRevisions.length ? (
                <Button
                  onClick={() => setReverting(true)}
                  size="sm"
                  variant="outline"
                >
                  <RotateCcw data-icon="inline-start" />
                  Revert page
                </Button>
              ) : null}
              {page?.renderSource === "ai" ? (
                <Badge variant="secondary">
                  {page.renderProvider} · {page.renderModel}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex h-[min(72vh,54rem)] min-h-[38rem]">
            <StoryboardPageIndex
              assetPreviews={previewData.assets}
              book={book}
              pageIndex={pageIndex}
              pagePreviews={previewData.sources}
              pages={pages}
              setPageIndex={setPageIndex}
            />
            <div className="relative min-w-0 flex-1">
              {canvas}
              {rerendering ? (
                <div
                  className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
                  aria-live="polite"
                  aria-label={`Re-rendering page ${page?.pageNumber}`}
                >
                  <div className="flex max-w-xs flex-col items-center gap-5 text-center">
                    <div
                      className="flex items-center gap-1.5"
                      aria-hidden="true"
                    >
                      <span className="size-2.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                      <span className="size-2.5 animate-bounce rounded-full bg-primary/75 [animation-delay:150ms]" />
                      <span className="size-2.5 animate-bounce rounded-full bg-primary/50 [animation-delay:300ms]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Re-rendering page {page?.pageNumber}…
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Comparing the source, rebuilding accessible HTML, and
                        checking the result.
                      </p>
                    </div>
                  </div>
                  <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow-lg">
                    <LoaderCircle className="mr-2 inline animate-spin" />
                    Re-rendering…
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
      <Dialog onOpenChange={setEditingPageSize} open={editingPageSize}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit page size</DialogTitle>
            <DialogDescription>
              Change this digital page canvas without rasterising its accessible
              HTML.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Width
              <input
                className="h-9 rounded-md border bg-background px-3 font-normal"
                min="100"
                onChange={(event) => setPageWidth(event.target.value)}
                type="number"
                value={pageWidth}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Height
              <input
                className="h-9 rounded-md border bg-background px-3 font-normal"
                min="100"
                onChange={(event) => setPageHeight(event.target.value)}
                type="number"
                value={pageHeight}
              />
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditingPageSize(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={() => void savePageSize()}>Apply page size</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {page && editingHtml ? (
        <HtmlSourceEditorDialog
          html={page.html}
          onOpenChange={setEditingHtml}
          onSave={saveHtml}
          open={editingHtml}
          pageNumber={page.pageNumber}
        />
      ) : null}
      <Dialog onOpenChange={setRerenderOpen} open={rerenderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-render page {page?.pageNumber}</DialogTitle>
            <DialogDescription>
              Would you like Litera to make specific fixes while rebuilding this
              page?
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            className="w-full"
            onValueChange={(value) =>
              value && setHasRerenderFixes(value as "yes" | "no")
            }
            type="single"
            value={hasRerenderFixes}
            variant="outline"
          >
            <ToggleGroupItem className="flex-1" value="no">
              No, rebuild faithfully
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1" value="yes">
              Yes, I have fixes
            </ToggleGroupItem>
          </ToggleGroup>
          {hasRerenderFixes === "yes" ? (
            <Textarea
              autoFocus
              onChange={(event) => setRerenderInstructions(event.target.value)}
              placeholder="Describe the fixes for this page…"
              rows={5}
              value={rerenderInstructions}
            />
          ) : null}
          <DialogFooter>
            <Button onClick={() => setRerenderOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={
                hasRerenderFixes === "yes" && !rerenderInstructions.trim()
              }
              onClick={() => void rerenderCurrentPage()}
            >
              <RefreshCw data-icon="inline-start" />
              Re-render page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setReverting} open={reverting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert page {page?.pageNumber}</DialogTitle>
            <DialogDescription>
              Choose any earlier rendering. Restoring it creates another
              revision, so you can change your mind repeatedly.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="flex flex-col gap-2 pr-3">
              {pageRevisions.map((revision, index) => (
                <Button
                  className="h-auto justify-start py-3 text-left"
                  key={revision.id}
                  onClick={() => void restorePageRevision(revision)}
                  variant="outline"
                >
                  <span>
                    <strong className="block">
                      Version {pageRevisions.length - index}
                    </strong>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(revision.createdAt).toLocaleString()} ·{" "}
                      {revision.summary}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {page ? (
        <ImageEditorDialog
          apiKey={providerKeys?.openai}
          assets={bookImageAssets}
          currentPageNumber={page.pageNumber}
          onApply={applyImageEdit}
          onOpenChange={setEditingImage}
          open={editingImage}
        />
      ) : null}
    </div>
  );
}

function StoryboardCanvas({
  imageUrls,
  onEditHtml,
  onEditImage,
  onEditPageSize,
  page,
  pageCount,
  pageIndex,
  setPageIndex,
  setViewport,
  setZoom,
  storyboardCss,
  viewport,
  zoom,
}: {
  imageUrls: Record<string, string>;
  onEditHtml: () => void;
  onEditImage: () => void;
  onEditPageSize: () => void;
  page: StoryboardPage;
  pageCount: number;
  pageIndex: number;
  setPageIndex: (index: number) => void;
  setViewport: (viewport: Viewport) => void;
  setZoom: (zoom: number) => void;
  storyboardCss?: string;
  viewport: Viewport;
  zoom: number;
}) {
  const pageImageUrl = imageUrls;
  const width =
    viewport === "mobile"
      ? "min(390px, 100%)"
      : viewport === "tablet"
        ? "min(768px, 100%)"
        : "100%";
  const aiRendered = page.renderSource === "ai";
  const sourceRatio =
    page.sourceWidth && page.sourceHeight
      ? page.sourceWidth / page.sourceHeight
      : (page.sourceAspectRatio ?? 0.773);
  const renderedHtml = withStoryboardCss(
    aiRendered ? hydrateStoryboardAssets(page.html, imageUrls) : page.html,
    storyboardCss,
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data as { type?: string; pageNumber?: number };
      if (
        data?.type !== "litera-open-page" ||
        !Number.isInteger(data.pageNumber) ||
        data.pageNumber! < 1 ||
        data.pageNumber! > pageCount
      )
        return;
      setPageIndex(data.pageNumber! - 1);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [pageCount, setPageIndex]);
  return (
    <div className="flex size-full min-h-[38rem] flex-col bg-muted/20">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div
          className="mx-auto transition-[width,transform] duration-400"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top center",
            width,
          }}
        >
          <iframe
            className="block w-full rounded-xl border bg-background shadow-sm"
            sandbox="allow-forms allow-scripts"
            srcDoc={renderedHtml}
            style={{ aspectRatio: String(sourceRatio) }}
            title={`Generated HTML for page ${page.pageNumber}`}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-background p-3 shadow-[0_-8px_24px_-20px_rgba(0,0,0,.45)]">
        <Button
          aria-label="Previous page"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex(pageIndex - 1)}
          size="icon-sm"
          variant="outline"
        >
          <ArrowLeft />
        </Button>
        <Badge variant="secondary">
          Page {page.digitalPageNumber ?? pageIndex + 1} · Source {page.pageNumber} · {pageIndex + 1}/{pageCount}
        </Badge>
        <Button
          aria-label="Next page"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => setPageIndex(pageIndex + 1)}
          size="icon-sm"
          variant="outline"
        >
          <ArrowRight />
        </Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button onClick={onEditHtml} size="sm" variant="outline">
          <Code2 data-icon="inline-start" />
          HTML
        </Button>
        <Button
          disabled={Object.keys(imageUrls).length === 0}
          onClick={onEditImage}
          size="sm"
          variant="outline"
        >
          <ImageIcon data-icon="inline-start" />
          Images
        </Button>
        <Button onClick={onEditPageSize} size="sm" variant="outline">
          Page size
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            aria-label="Desktop viewport"
            onClick={() => setViewport("desktop")}
            size="icon-sm"
            variant={viewport === "desktop" ? "secondary" : "ghost"}
          >
            <Monitor />
          </Button>
          <Button
            aria-label="Tablet viewport"
            onClick={() => setViewport("tablet")}
            size="icon-sm"
            variant={viewport === "tablet" ? "secondary" : "ghost"}
          >
            <Tablet />
          </Button>
          <Button
            aria-label="Mobile viewport"
            onClick={() => setViewport("mobile")}
            size="icon-sm"
            variant={viewport === "mobile" ? "secondary" : "ghost"}
          >
            <Smartphone />
          </Button>
          <Button
            aria-label="Zoom out"
            disabled={zoom <= 60}
            onClick={() => setZoom(Math.max(60, zoom - 10))}
            size="icon-sm"
            variant="ghost"
          >
            <ZoomOut />
          </Button>
          <Badge variant="outline">{zoom}%</Badge>
          <Button
            aria-label="Zoom in"
            disabled={zoom >= 140}
            onClick={() => setZoom(Math.min(140, zoom + 10))}
            size="icon-sm"
            variant="ghost"
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StoryboardPageIndex({
  assetPreviews,
  book,
  pageIndex,
  pagePreviews,
  pages,
  setPageIndex,
}: {
  assetPreviews: Record<number, Record<string, string>>;
  book: DeviceBook;
  pageIndex: number;
  pagePreviews: Record<number, string>;
  pages: StoryboardPage[];
  setPageIndex: (index: number) => void;
}) {
  const sourcePages = [...(book.extractedPages ?? [])].sort(
    (a, b) => a.number - b.number,
  );
  const total = Math.max(sourcePages.length, pages.length);
  return (
    <TooltipProvider delayDuration={650}>
      <aside className="hidden w-44 shrink-0 border-r bg-background lg:flex lg:flex-col">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium">Pages</p>
          <p className="text-[10px] text-muted-foreground">
            {pages.length} of {total} rendered
          </p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2">
            {Array.from({ length: total }, (_, index) => {
              const sourcePage = sourcePages[index];
              const sourcePageNumber =
                sourcePage?.number ?? pages[index]?.pageNumber;
              const storyboardPage = pages.find(
                (candidate) => candidate.pageNumber === sourcePageNumber,
              );
              const complete = Boolean(storyboardPage);
              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-primary/10",
                        pageIndex === index && "bg-primary/10 text-primary",
                      )}
                      disabled={!complete}
                      onClick={() => setPageIndex(index)}
                      type="button"
                    >
                      <div className="relative aspect-[3/4] w-12 shrink-0 overflow-hidden rounded border bg-muted">
                        {sourcePageNumber && pagePreviews[sourcePageNumber] ? (
                          <img
                            alt=""
                            className="size-full object-contain"
                            src={pagePreviews[sourcePageNumber]}
                          />
                        ) : null}
                        <span className="absolute inset-0 grid place-items-center bg-background/45">
                          {complete ? (
                            <Check />
                          ) : (
                            <LoaderCircle
                              className={cn(
                                book.pipelineRun?.stage === "storyboard" &&
                                  book.pipelineRun.status === "running" &&
                                  "animate-spin",
                              )}
                            />
                          )}
                        </span>
                      </div>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">
                          Page {sourcePageNumber ?? index + 1}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {complete
                            ? "Rendered"
                            : sourcePage
                              ? "Waiting"
                              : "Extracting"}
                        </span>
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    className="w-[42rem] max-w-[min(42rem,calc(100vw-2rem))] bg-popover p-3 text-popover-foreground shadow-xl"
                    side="right"
                    sideOffset={10}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <PreviewPane
                        label="Extracted source"
                        ratio={
                          sourcePage?.width && sourcePage.height
                            ? sourcePage.width / sourcePage.height
                            : undefined
                        }
                      >
                        {pagePreviews[index + 1] ? (
                          <img
                            alt={`Extracted source page ${index + 1}`}
                            className="size-full object-contain"
                            src={pagePreviews[index + 1]}
                          />
                        ) : (
                          <div className="grid size-full place-items-center text-muted-foreground">
                            Extracting…
                          </div>
                        )}
                      </PreviewPane>
                      <PreviewPane
                        label="Storyboard outcome"
                        ratio={storyboardPage?.sourceAspectRatio}
                      >
                        {storyboardPage ? (
                          <iframe
                            className="size-[400%] origin-top-left scale-25 bg-background"
                            loading="lazy"
                            sandbox=""
                            srcDoc={withStoryboardCss(
                              hydrateStoryboardAssets(
                                storyboardPage.html,
                                assetPreviews[index + 1] ?? {},
                              ),
                              book.storyboardCss,
                            )}
                            title={`Storyboard outcome page ${index + 1}`}
                          />
                        ) : (
                          <div className="grid size-full place-items-center text-muted-foreground">
                            Waiting to render…
                          </div>
                        )}
                      </PreviewPane>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}

function withStoryboardCss(html: string, css?: string) {
  if (!css) return html;
  const style = `<style id="litera-storyboard-tailwind">${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${style}</head>`)
    : `${style}${html}`;
}

function PreviewPane({
  children,
  label,
  ratio = 0.773,
}: {
  children: React.ReactNode;
  label: string;
  ratio?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-medium">{label}</p>
      <div
        className="overflow-hidden rounded-lg border bg-muted/20"
        style={{ aspectRatio: String(ratio) }}
      >
        {children}
      </div>
    </div>
  );
}

function useObjectUrls(assets?: Array<{ id: string; blob: Blob }>) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    Promise.all(
      (assets ?? []).map(
        async (asset) => [asset.id, await blobDataUrl(asset.blob)] as const,
      ),
    ).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [assets]);
  return urls;
}
function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function usePagePreviews(book: DeviceBook) {
  const [data, setData] = useState<{
    sources: Record<number, string>;
    assets: Record<number, Record<string, string>>;
  }>({ sources: {}, assets: {} });
  useEffect(() => {
    let active = true;
    void Promise.all(
      (book.extractedPages ?? []).map(async (page) => {
        const sourceBlob = page.thumbnailBytes
          ? new Blob([page.thumbnailBytes], { type: "image/png" })
          : page.thumbnail;
        const source = sourceBlob
          ? await blobDataUrl(sourceBlob).catch(() => "")
          : "";
        const assetEntries = await Promise.all(
          (page.assets ?? []).map(
            async (asset) =>
              [
                asset.id,
                await blobDataUrl(asset.blob).catch(() => ""),
              ] as const,
          ),
        );
        return [
          page.number,
          source,
          Object.fromEntries(assetEntries.filter(([, url]) => Boolean(url))),
        ] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setData({
        sources: Object.fromEntries(
          entries
            .map(([number, source]) => [number, source])
            .filter(([, source]) => Boolean(source)),
        ),
        assets: Object.fromEntries(
          entries.map(([number, , assets]) => [number, assets]),
        ),
      });
    });
    return () => {
      active = false;
    };
  }, [book.extractedPages]);
  return data;
}

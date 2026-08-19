"use client";

import { Crop, ImagePlus, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExtractedPageAsset } from "@/components/device/device-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { editImageWithOpenAi } from "@/lib/device-pipeline/ai-image-engine";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/feedback";

export type BookImageAsset = ExtractedPageAsset & { pageNumber: number };

export function ImageEditorDialog({
  apiKey,
  assets,
  currentPageNumber,
  onApply,
  onOpenChange,
  open,
}: {
  apiKey?: string;
  assets: BookImageAsset[];
  currentPageNumber: number;
  onApply: (target: BookImageAsset, replacement: Blob, summary: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [targetId, setTargetId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [mode, setMode] = useState<"crop" | "book" | "device" | "ai">("crop");
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [upload, setUpload] = useState<Blob>();
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useAssetUrls(assets);
  const editableAssets = assets.filter(isMeaningfulEditableAsset);
  const pageAssets = editableAssets.filter((asset) => asset.pageNumber === currentPageNumber);
  const target = pageAssets.find((asset) => asset.id === targetId) ?? pageAssets[0];
  const replacements = editableAssets.filter((asset) => asset.id !== target?.id);

  async function apply() {
    if (!target || pending) return;
    setPending(true);
    try {
      let blob: Blob;
      let summary: string;
      if (mode === "crop") {
        blob = await cropImage(target.blob, crop);
        summary = `Cropped image ${target.id}`;
      } else if (mode === "book") {
        const replacement = assets.find((asset) => asset.id === replacementId);
        if (!replacement) throw new Error("Choose a replacement image from the book.");
        blob = replacement.blob;
        summary = `Replaced image ${target.id} from book asset ${replacement.id}`;
      } else if (mode === "device") {
        if (!upload) throw new Error("Choose an image from this device.");
        blob = upload;
        summary = `Replaced image ${target.id} from device`;
      } else {
        blob = await editImageWithOpenAi({
          apiKey: apiKey ?? "",
          image: target.blob,
          instruction,
        });
        summary = `AI edited image ${target.id}: ${instruction.trim()}`;
      }
      await onApply(target, blob, summary);
      onOpenChange(false);
      toast.success("The image was updated and the original was preserved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The image could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="grid h-[min(92dvh,52rem)] w-[min(96vw,64rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:!max-w-none">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Edit page image</DialogTitle>
          <DialogDescription>
            Originals remain in the book asset library. Every edit creates a new reusable asset.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-5 overflow-y-auto p-5 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Image on this page</p>
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 md:max-h-[calc(92dvh-12rem)] md:grid-cols-1 lg:grid-cols-2">
              {pageAssets.map((asset) => (
                <button
                  className={cn("overflow-hidden rounded-lg border bg-muted/20 p-1", target?.id === asset.id && "ring-2 ring-primary")}
                  key={`${asset.pageNumber}-${asset.id}`}
                  onClick={() => setTargetId(asset.id)}
                  type="button"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={`Book asset ${asset.id}`} className="aspect-square w-full object-contain" src={urls[asset.id]} />
                  <span className="block truncate px-1 py-1 text-[10px]">Page {asset.pageNumber}</span>
                </button>
              ))}
              {!pageAssets.length ? <p className="col-span-full rounded-lg border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">No standalone illustration was detected on this page. Decorative rules, masks, and text-panel fragments are intentionally excluded.</p> : null}
            </div>
          </div>
          <div className="min-w-0">
            {target ? (
              <div className="mb-4 grid min-h-52 place-items-center overflow-hidden rounded-xl border bg-muted/20 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Selected book asset" className="max-h-72 max-w-full object-contain" src={urls[target.id]} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {([
                ["crop", Crop, "Crop"],
                ["book", ImagePlus, "From book"],
                ["device", Upload, "From device"],
                ["ai", Sparkles, "AI edit"],
              ] as const).map(([value, Icon, label]) => (
                <Button className="min-w-0 justify-center whitespace-nowrap px-3" key={value} onClick={() => setMode(value)} variant={mode === value ? "secondary" : "outline"}>
                  <Icon data-icon="inline-start" />{label}
                </Button>
              ))}
            </div>
            <div className="mt-4 rounded-xl border p-4">
              {mode === "crop" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label className="grid min-w-0 gap-2 text-xs font-medium" key={key}>
                      <span className="flex items-center justify-between gap-3"><span>{key === "x" ? "Left" : key === "y" ? "Top" : key[0].toUpperCase() + key.slice(1)}</span><output className="tabular-nums">{crop[key]}%</output></span>
                      <input className="block w-full min-w-0 accent-primary" max={key === "x" || key === "y" ? 80 : 100} min={key === "width" || key === "height" ? 10 : 0} onChange={(event) => setCrop((current) => ({ ...current, [key]: Number(event.target.value) }))} type="range" value={crop[key]} />
                    </label>
                  ))}
                </div>
              ) : mode === "book" ? (
                <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {replacements.map((asset) => (
                    <button className={cn("overflow-hidden rounded-lg border p-1", replacementId === asset.id && "ring-2 ring-primary")} key={`${asset.pageNumber}-${asset.id}`} onClick={() => setReplacementId(asset.id)} type="button">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={`Asset from page ${asset.pageNumber}`} className="aspect-square w-full object-contain" src={urls[asset.id]} />
                      <span className="block text-[10px]">Page {asset.pageNumber}</span>
                    </button>
                  ))}
                </div>
              ) : mode === "device" ? (
                <div>
                  <Button onClick={() => inputRef.current?.click()} variant="outline"><Upload data-icon="inline-start" />Choose image</Button>
                  <span className="ml-3 text-sm text-muted-foreground">{upload ? `${Math.round(upload.size / 1024)} KB selected` : "PNG, JPEG, or WebP"}</span>
                  <input accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setUpload(event.target.files?.[0])} ref={inputRef} type="file" />
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">The current image is sent with your instruction, so the AI edits it in context instead of guessing from text alone.</p>
                  <Textarea onChange={(event) => setInstruction(event.target.value)} placeholder="For example: remove the background but preserve the child, clothing, pose, and illustration style…" rows={5} value={instruction} />
                  {!apiKey ? <p className="mt-2 text-xs text-destructive">Configure an OpenAI key to enable contextual AI image editing.</p> : null}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="border-t bg-background px-5 py-4">
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">Cancel</Button>
          <Button disabled={pending || !target || (mode === "ai" && (!apiKey || !instruction.trim()))} onClick={() => void apply()}>
            {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            Apply as new asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isMeaningfulEditableAsset(asset: BookImageAsset) {
  if (asset.containsText) return false;
  const { w, h } = asset.bounds;
  if (w < 8 || h < 8) return false;
  const ratio = w / Math.max(1, h);
  return ratio >= 0.2 && ratio <= 5 && w * h >= 180;
}

function useAssetUrls(assets: BookImageAsset[]) {
  const urls = useMemo(
    () =>
      Object.fromEntries(
        assets.map((asset) => {
          // Older persisted conversions may restore the Blob shell without
          // its payload while retaining the canonical bytes. Rehydrate here
          // so the replacement library never displays broken thumbnails.
          const source =
            asset.blob instanceof Blob && asset.blob.size > 0
              ? asset.blob
              : asset.bytes
                ? new Blob([asset.bytes], { type: "image/png" })
                : asset.blob;
          return [asset.id, URL.createObjectURL(source)];
        }),
      ),
    [assets],
  );
  useEffect(() => {
    return () =>
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [urls]);
  return urls;
}

async function cropImage(blob: Blob, crop: { x: number; y: number; width: number; height: number }) {
  const bitmap = await createImageBitmap(blob);
  const x = Math.min(bitmap.width - 1, Math.round((crop.x / 100) * bitmap.width));
  const y = Math.min(bitmap.height - 1, Math.round((crop.y / 100) * bitmap.height));
  const width = Math.max(1, Math.min(bitmap.width - x, Math.round((crop.width / 100) * bitmap.width)));
  const height = Math.max(1, Math.min(bitmap.height - y, Math.round((crop.height / 100) * bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  bitmap.close();
  const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.96));
  if (!result) throw new Error("The selected crop could not be created.");
  return result;
}

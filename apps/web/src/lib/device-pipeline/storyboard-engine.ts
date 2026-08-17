import type { ExtractedLayoutBlock, ExtractedPageAsset, StoryboardBlock, StoryboardPage, StructuredPage } from "@/components/device/device-types";

type StoryboardSource = { width?: number; height?: number; layoutBlocks?: ExtractedLayoutBlock[]; assets?: ExtractedPageAsset[] };
type RenderOptions = { imageUrls?: Record<string, string>; sourceImageUrl?: string | Record<string, string>; accentColor?: string; surfaceColor?: string };

const publisherMark = /for online reading only|\.indd\s+\d|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}|^[ivxlcdm]+$/i;
const chapterLabel = /^(sura|chapter|unit|sehemu)\b/i;
const calloutLabel = /^(utangulizi|introduction|muhtasari|summary)\b/i;
const sidebarLabel = /^(fikiri|kumbuka|did you know|tafakari|dokezo|note)\b/i;
const activityLabel = /^(kazi|zoezi|shughuli|activity|exercise|jaribio)\b/i;
const listLabel = /^(hatua|steps?|maelekezo|instructions?)\b/i;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function visualRole(text: string, fontSize: number, maxFont: number, y: number, pageHeight: number): NonNullable<StoryboardBlock["visualRole"]> {
  if (chapterLabel.test(text)) return "chapter";
  if (calloutLabel.test(text) && text.length < 72) return "callout";
  if (sidebarLabel.test(text) && text.length < 72) return "sidebar";
  if (activityLabel.test(text) && text.length < 96) return "activity";
  if (listLabel.test(text) && text.length < 72) return "section";
  if (fontSize >= Math.max(18, maxFont * 0.72) || (y < pageHeight * 0.24 && fontSize >= maxFont * 0.55)) return "title";
  if (text.length < 72 && fontSize >= Math.max(11, maxFont * 0.38)) return "section";
  return "body";
}

export function createStoryboardPage(page: StructuredPage, source?: StoryboardSource, fontFamily?: string): StoryboardPage {
  const sourceText = (source?.layoutBlocks ?? [])
    .filter((item) => item.type === "text" && clean(item.text ?? "") && !publisherMark.test(clean(item.text ?? "")))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const maxFont = Math.max(1, ...sourceText.map((item) => item.font?.size ?? 0));
  const blocks: StoryboardBlock[] = sourceText.map((item, index) => {
    const content = clean(item.text ?? "");
    const role = visualRole(content, item.font?.size ?? 0, maxFont, item.bbox.y, source?.height ?? 1);
    return {
      id: `page-${page.pageNumber}-text-${index}`,
      kind: role === "chapter" || role === "title" || role === "section" || role === "callout" || role === "sidebar" || role === "activity" ? "heading" : /^\d+[.)]\s/.test(content) ? "list" : "text",
      content,
      order: index,
      sourceBounds: item.bbox,
      sourceFont: item.font,
      sourceText: content,
      visualRole: role,
    };
  });

  for (const [index, asset] of (source?.assets ?? []).entries()) {
    const nearest = blocks.reduce<StoryboardBlock | undefined>((best, block) => {
      if (!block.sourceBounds) return best;
      const distance = Math.abs(block.sourceBounds.y - asset.bounds.y);
      const bestDistance = best?.sourceBounds ? Math.abs(best.sourceBounds.y - asset.bounds.y) : Number.POSITIVE_INFINITY;
      return distance < bestDistance ? block : best;
    }, undefined);
    blocks.push({
      id: `page-${page.pageNumber}-figure-${index}`,
      kind: "image",
      content: nearest?.content ? `Illustration for ${nearest.content}` : `Illustration on page ${page.pageNumber}`,
      accessibleLabel: nearest?.content ? `Illustration accompanying ${nearest.content}` : `Illustration on page ${page.pageNumber}`,
      assetId: asset.id,
      order: blocks.length,
      sourceBounds: asset.bounds,
      visualRole: nearest?.visualRole === "sidebar" ? "sidebar" : "body",
    });
  }

  if (!blocks.length) {
    page.sections.forEach((section, index) => blocks.push({
      id: `storyboard-${section.id}`,
      kind: section.kind === "heading" ? "heading" : section.kind === "list-item" ? "list" : section.kind === "image" ? "image" : "text",
      content: section.text,
      order: index,
      accessibleLabel: section.altText,
      visualRole: section.kind === "heading" ? (index ? "section" : "title") : "body",
    }));
  }
  page.activities
    .filter((activity) => activity.responseMode !== "none")
    .forEach((activity, index) => blocks.push({ id: `storyboard-${activity.id}`, kind: "activity", content: activity.prompt, order: blocks.length + index, accessibleLabel: activity.accessibilityHint, visualRole: "activity" }));

  const storyboard: StoryboardPage = {
    pageNumber: page.pageNumber,
    status: "ready",
    storyboardedAt: new Date().toISOString(),
    title: page.title,
    layout: page.activities.some((activity) => activity.responseMode !== "none") ? "activity" : (source?.assets?.length ?? 0) ? "visual" : "reading",
    sourceAspectRatio: source?.width && source?.height ? source.width / source.height : undefined,
    sourceWidth: source?.width,
    sourceHeight: source?.height,
    sourceMasks: [],
    fontFamily,
    blocks,
    html: "",
  };
  storyboard.html = renderStoryboardHtml(storyboard);
  return storyboard;
}

function bodyBlock(block: StoryboardBlock) {
  const content = escapeHtml(block.content);
  if (block.kind === "list") return `<li data-block-id="${escapeHtml(block.id)}">${content.replace(/^\d+[.)]\s*/, "")}</li>`;
  return `<p data-block-id="${escapeHtml(block.id)}">${content}</p>`;
}

function imageBlock(block: StoryboardBlock, imageUrls: Record<string, string>) {
  const url = block.assetId ? imageUrls[block.assetId] : undefined;
  if (!url) return "";
  return `<figure data-block-id="${escapeHtml(block.id)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(block.accessibleLabel ?? block.content)}"><figcaption class="sr-only">${escapeHtml(block.content)}</figcaption></figure>`;
}

function renderRegions(page: StoryboardPage, imageUrls: Record<string, string>) {
  const ordered = [...page.blocks].filter((block) => !block.hidden).sort((a, b) => {
    const ay = a.sourceBounds?.y ?? a.order * 100;
    const by = b.sourceBounds?.y ?? b.order * 100;
    return ay - by || (a.sourceBounds?.x ?? 0) - (b.sourceBounds?.x ?? 0);
  });
  const consumed = new Set<string>();
  const output: string[] = [];
  const isComposedExampleImage = (candidate: StoryboardBlock) =>
    candidate.kind === "image" &&
    (candidate.assetId?.includes("composite-example") ||
      (/\b(?:mfano|example)\b/i.test(
        `${candidate.accessibleLabel ?? ""} ${candidate.content}`,
      ) &&
        Boolean(
          candidate.sourceBounds &&
            candidate.sourceBounds.h / Math.max(1, page.sourceHeight ?? 1) >=
              0.12,
        )));
  for (const block of ordered) {
    if (consumed.has(block.id)) continue;
    if (block.kind === "activity" && /_{3,}|\.{3,}/.test(block.content)) {
      const prompt = clean(block.content).toLocaleLowerCase();
      const represented = ordered.some((candidate) => {
        if (candidate.id === block.id || candidate.kind === "activity") return false;
        const content = clean(candidate.content).toLocaleLowerCase();
        return content.includes(prompt) || prompt.includes(content);
      });
      if (represented) continue;
    }
    if (block.kind === "image") {
      if (isComposedExampleImage(block) && block.sourceBounds) {
        const bounds = block.sourceBounds;
        const exampleText = ordered.filter((candidate) => {
          if (
            candidate.id === block.id ||
            candidate.kind === "image" ||
            candidate.kind === "activity" ||
            !candidate.sourceBounds
          )
            return false;
          const centerY =
            candidate.sourceBounds.y + candidate.sourceBounds.h / 2;
          return centerY >= bounds.y && centerY <= bounds.y + bounds.h;
        });
        exampleText.forEach((candidate) => consumed.add(candidate.id));
        output.push(
          `<section class="source-example" data-section-type="boxed_text">${imageBlock(block, imageUrls)}<div class="sr-only">${exampleText
            .map(
              (candidate) =>
                `<span data-block-id="${escapeHtml(candidate.id)}">${escapeHtml(candidate.content)}</span>`,
            )
            .join(" ")}</div></section>`,
        );
        continue;
      }
      output.push(imageBlock(block, imageUrls));
      continue;
    }
    if (/^(?:mfano|example)\s+(?:wa\s+)?\d+/i.test(block.content)) {
      const start = ordered.indexOf(block);
      const companions = ordered.slice(start + 1).filter((candidate) => {
        if (consumed.has(candidate.id) || candidate.kind === "image" || candidate.kind === "activity") return false;
        const boundary = /^(?:(?:mfano|example)\s+(?:wa\s+)?\d+|zoezi|activity|exercise|practice|maswali|shughuli)\b/i;
        if (boundary.test(candidate.content)) return false;
        const nextHeading = ordered.slice(start + 1, ordered.indexOf(candidate)).some((item) =>
          boundary.test(item.content),
        );
        return !nextHeading;
      });
      companions.forEach((candidate) => consumed.add(candidate.id));
      output.push(`<section class="panel example" data-section-type="boxed_text"><h2 data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.content)}</h2><div class="panel-content">${companions.map(bodyBlock).join("")}</div></section>`);
      continue;
    }
    if (block.visualRole === "chapter") {
      output.push(`<p class="chapter" data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.content)}</p>`);
      continue;
    }
    if (block.visualRole === "title") {
      output.push(`<h1 class="page-title" data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.content)}</h1>`);
      continue;
    }
    if (block.visualRole === "activity") {
      const start = ordered.indexOf(block);
      const height = page.sourceHeight ?? 1000;
      const companions: StoryboardBlock[] = [];
      for (const candidate of ordered.slice(start + 1)) {
        if (consumed.has(candidate.id) || candidate.kind === "image") continue;
        if (
          /^(?:mfano|example|zoezi|activity|exercise|practice|maswali|shughuli)\b/i.test(
            candidate.content,
          )
        )
          break;
        const y = candidate.sourceBounds?.y ?? 0;
        if (y >= height * 0.9) break;
        if (!candidate.content.replace(/[\x00-\x1f\x7f]/g, "").trim())
          continue;
        companions.push(candidate);
      }
      companions.forEach((candidate) => consumed.add(candidate.id));
      output.push(
        `<section class="panel activity" data-section-type="activity"><h2 data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.content)}</h2><div class="panel-content">${companions
          .map(bodyBlock)
          .join("")}</div></section>`,
      );
      continue;
    }
    if (["callout", "sidebar"].includes(block.visualRole ?? "")) {
      const y = block.sourceBounds?.y ?? 0;
      const height = page.sourceHeight ?? 1000;
      const companions = ordered.filter((candidate) => candidate.id !== block.id && !consumed.has(candidate.id) && Math.abs((candidate.sourceBounds?.y ?? Number.POSITIVE_INFINITY) - y) < height * 0.16 && candidate.visualRole === "body");
      const figures = ordered.filter((candidate) => candidate.kind === "image" && !consumed.has(candidate.id) && Math.abs((candidate.sourceBounds?.y ?? Number.POSITIVE_INFINITY) - y) < height * 0.16);
      companions.forEach((candidate) => consumed.add(candidate.id));
      figures.forEach((candidate) => consumed.add(candidate.id));
      output.push(`<section class="panel ${block.visualRole}" data-section-type="${block.visualRole}"><h2 data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.content)}</h2><div class="panel-content">${figures.map((item) => imageBlock(item, imageUrls)).join("")}${companions.map(bodyBlock).join("")}</div></section>`);
      continue;
    }
    if (block.visualRole === "section") {
      output.push(`<h2 class="section-title" data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.content)}</h2>`);
      continue;
    }
    if (block.kind === "activity") {
      output.push(`<section class="panel activity"><h2>Activity</h2><div class="panel-content"><p>${escapeHtml(block.content)}</p><label>Response<textarea aria-label="Response"></textarea></label></div></section>`);
      continue;
    }
    output.push(bodyBlock(block));
  }
  return output.join("\n");
}

export function renderStoryboardHtml(page: StoryboardPage, options: RenderOptions = {}) {
  const font = escapeHtml(page.fontFamily || "Arimo, Arial, sans-serif");
  const accent = /^#[0-9a-f]{6}$/i.test(options.accentColor ?? "") ? options.accentColor : "#a77806";
  const surface = /^#[0-9a-f]{6}$/i.test(options.surfaceColor ?? "") ? options.surfaceColor : "#f0f9ff";
  const legacyImages = typeof options.sourceImageUrl === "object" ? options.sourceImageUrl : {};
  const content = renderRegions(page, options.imageUrls ?? legacyImages);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{font-family:${font};color:#25221f;background:#fff;--ink:#25221f;--green:${accent};--green-soft:#f8f3df;--orange:#c96d26;--orange-soft:#f7f1df}*{box-sizing:border-box}body{margin:0;padding:clamp(12px,3vw,40px);background:#fff}main{width:min(100%,1000px);min-height:calc(100vh - 48px);margin:auto;padding:clamp(20px,5vw,64px);background:#f7f4e8}article{display:flow-root}.chapter{margin:0 0 1.25rem;color:var(--green);font-size:clamp(2rem,5vw,3.5rem);font-weight:800}.page-title{display:inline-block;margin:0 0 clamp(3rem,9vw,7rem);padding:.65em 1.2em;border-radius:18px;background:var(--green);box-shadow:0 12px 24px #0002;color:white;font-size:clamp(1.65rem,4vw,2.6rem);line-height:1.1}p,li{font-size:clamp(1rem,2.2vw,1.32rem);line-height:1.6}.section-title{margin:2rem 0 .5rem;color:var(--green);font-size:clamp(1.5rem,3vw,2rem)}.source-example{margin:0 0 2rem;border:2px solid #a78110;border-radius:28px;background:#fff;padding:18px;overflow:hidden}.source-example figure{margin:0}.source-example img{display:block;width:100%;height:auto;border-radius:18px}.panel{clear:both;margin:2rem 0;border:1px solid #efc39f;border-radius:28px;background:#f7f1df;overflow:hidden;box-shadow:0 4px 12px #0001}.panel>h2{display:block;margin:0;padding:1rem 1.75rem;background:linear-gradient(180deg,#f6c89f,#efb47f);color:#241d18;font-size:clamp(1.35rem,3vw,1.9rem);font-weight:800}.panel-content{display:flow-root;padding:1.4rem 2rem 1.8rem}.panel-content p{margin:.35rem 0}.callout{border-color:#ffbd63;background:var(--orange-soft)}.sidebar{float:right;clear:right;width:min(44%,430px);margin:1rem 0 2rem 2rem}.activity{clear:both}.activity .panel-content{background:#f7f1df}.panel figure{float:left;width:min(36%,160px);margin:0 1.2rem .5rem 0}.panel img,article>figure img{display:block;width:100%;height:auto;object-fit:contain}article>figure{margin:1.5rem auto;max-width:70%}input[type=text]{min-width:4rem;border:0;border-bottom:2px solid #625c55;background:#fff;padding:.25rem .5rem;text-align:center;font:inherit}textarea{display:block;width:100%;min-height:7rem;margin-top:.5rem;border:1px solid #b9c4bf;border-radius:12px;padding:1rem;font:inherit}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}@media(max-width:640px){body{padding:0}main{min-height:100vh;padding:20px}.page-title{margin-bottom:3rem}.sidebar{float:none;width:100%;margin:1.5rem 0}.panel-content{padding:1.15rem}.panel figure{float:none;width:min(70%,220px);margin:0 auto 1rem}article>figure{max-width:100%}}
  </style></head><body><main aria-label="Accessible book page ${page.pageNumber}" data-litera-page><article>${content}</article></main></body></html>`;
}

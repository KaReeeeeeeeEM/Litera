import type { ProviderKeys, ProviderId } from "@/components/device/provider-vault";
import { parseProviderJson, readProviderResponseJson } from "@/lib/device-pipeline/provider-json";

export type AiStoryboardResult = { html: string; model: string; provider: ProviderId; fingerprint: string };
export type AiStoryboardAsset = { id: string; blob: Blob; bounds: { x: number; y: number; w: number; h: number } };
export type AiStoryboardLayoutBlock = { type: "text" | "image"; bbox: { x: number; y: number; w: number; h: number }; text?: string; font?: { name?: string; family?: string; weight?: string; style?: string; size?: number; color?: string } };
export type AiStoryboardContentNode = { id: string; role: string; text: string; level?: number };
export type AiImageCaption = { imageId: string; caption: string };

// This contract mirrors source system's web_generation_html + page visual-review
// pipeline. Keeping it here makes the local client use the same rendering
// strategy without coupling Litera to source system's server-only packages.
const prompt = `You are an expert frontend engineer generating accessible HTML textbook pages. The source page is the visual target, not merely a content reference. Recreate it so a student immediately recognises it as the same book in digital form. The screenshot MUST NOT appear as the page background.

PRIMARY GOAL — PRESERVE THE BOOK'S VISUAL IDENTITY:
- Match composition: column count, content order, relative widths, image placement, text wrapping, whitespace, margins, alignment, and visual balance.
- Match design language: backgrounds, panel colours, borders, corner shapes, rules, badges, callouts, chapter bands, and decorative treatments.
- Match hierarchy: title prominence, heading scale, body density, captions, labels, lists, tables, activities, headers, footers, and page numbers.
- Preserve supplied images at the same role, approximate proportion, crop, and placement.
- Do not return a generic white web layout when the original uses distinctive colours, columns, panels, artwork, or spatial relationships.
- Never invent black, charcoal, or dark-neutral panels when those colours are absent from the supplied book palette. Do not use opacity on text. White text is permitted only on a genuinely dark, opaque surface that provides readable contrast; otherwise use the darkest supplied palette colour.

Use Tailwind CSS utilities for presentation. Litera compiles the exact classes after generation. Preserve the exact supplied text once, in semantic DOM reading order. Use the geometry map to infer grouping, hierarchy, relative scale, and reading order, but build a responsive semantic layout like an Litera publication rather than absolutely positioning every extracted PDF line. Preserve the original margins and distinctive composition without imposing a generic centered reading column. Never use overflow clipping; all content must remain readable.

Return one complete HTML document whose visible root is <main data-litera-page class="relative mx-auto w-full bg-white">. Do not center left-aligned content, flatten panels, discard colors, or reduce meaningful images to thumbnails. Put data-id on every semantic content element, using only the stable IDs from the authoritative content tree. Elements with data-id must contain their exact source text and each ID must occur exactly once. Geometry-map IDs are coordinate labels only and must never be used as data-id values.

The geometry map is authoritative grouping evidence. Match semantic tree elements to their corresponding text geometry by content and include data-source-bounds="x,y,width,height" with the source values wherever there is a direct match. Reconstruct continuous paragraphs and semantic structures without duplicating PDF line fragments. Preserve text exactly once and in semantic DOM reading order. Use headings, paragraphs, lists, tables, figures, labels, and accessible form controls as appropriate. Omit printer metadata, timestamps, watermarks, and notices such as FOR ONLINE READING ONLY. Do not include scripts, external URLs, markdown, or explanations.

The additional images after the page reference are the ONLY visual assets permitted in the output. Each is labelled with a stable asset ID and source bounds. Use <img> only for a genuine photograph, diagram, illustration, signature, seal, or decorative artwork represented by one of those asset IDs. Reference it only as <img src="litera-asset://ASSET_ID">; never redraw, replace, crop, stretch, recolor, invent, or screenshot an asset. Use object-fit:contain and preserve its aspect ratio.

TABLES AND EXERCISES:
- When aligned rows, columns, calculations, or source rules form a table, use semantic table, thead, tbody, tr, th, and td elements. Reproduce every visible horizontal and vertical rule with CSS borders; never flatten a ruled table into loose divs or whitespace.
- Detect instructions, numbered questions, blanks, choices, matching tasks, drawings, and discussion activities. Preserve the printed prompt and add labelled, keyboard-accessible inputs appropriate to the response: radio buttons for choices, select controls for matching, text inputs for short answers/blanks, and textareas for extended responses. Do not render a learner exercise as static prose only.
- Coloured title bands and activity headers must use opaque, saturated palette surfaces. Never use white text on a pale or translucent background.

All prose, headings, exercises, tables, answer spaces, conversations, labels, metadata, coloured panels, borders, rules, and page furniture must be recreated as semantic HTML and CSS. Never use a source-page crop, the whole page, a text panel, an exercise, or a table as an image. If a visual is not in the supplied asset list, recreate only its non-pictorial layout treatment with HTML/CSS; do not take pixels from the page reference. Do not include scripts, external URLs, markdown, or explanations. Return one complete self-contained HTML document.`;

export async function storyboardFingerprint(image: Blob, fontFamily = "", assets: AiStoryboardAsset[] = [], layoutBlocks: AiStoryboardLayoutBlock[] = []) {
  const bytes = new Uint8Array(await image.arrayBuffer());
  const assetSignature = assets.map(asset => `${asset.id}:${asset.bounds.x}:${asset.bounds.y}:${asset.bounds.w}:${asset.bounds.h}:${asset.blob.size}`).join("|");
  const layoutSignature = layoutBlocks.map(block => `${block.type}:${block.bbox.x}:${block.bbox.y}:${block.bbox.w}:${block.bbox.h}:${block.text ?? ""}:${block.font?.size ?? ""}`).join("|");
  const metadata = new TextEncoder().encode(`${fontFamily}|${assetSignature}|${layoutSignature}`);
  const input = new Uint8Array(bytes.length + metadata.length + 2);
  input.set(bytes); input.set(metadata, bytes.length); input.set([8, 0], bytes.length + metadata.length);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", input))].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function renderPageWithAi({ image, assets = [], layoutBlocks = [], contentTree = [], styleguide, userInstructions, keys, provider, fontFamily, sourceText, sourceWidth, sourceHeight, fingerprint: preparedFingerprint, signal }: { image: Blob; assets?: AiStoryboardAsset[]; layoutBlocks?: AiStoryboardLayoutBlock[]; contentTree?: AiStoryboardContentNode[]; styleguide?: string; userInstructions?: string; keys: ProviderKeys; provider: ProviderId; fontFamily?: string; sourceText?: string; sourceWidth?: number; sourceHeight?: number; fingerprint?: string; signal?: AbortSignal }): Promise<AiStoryboardResult> {
  // Extraction already renders a compact page thumbnail at 0.5–1×. Re-decoding
  // persisted blobs with createImageBitmap breaks in some WKWebView versions.
  const dataUrl = await blobDataUrl(image);
  const base64 = dataUrl.split(",")[1] ?? "";
  const mime = image.type || "image/png";
  const compactText = sourceText?.replace(/\s+/g, " ").trim().slice(0, 3000);
  const dimensions = `${Math.max(1, sourceWidth ?? 612)} × ${Math.max(1, sourceHeight ?? 792)}`;
  const assetInputs = await Promise.all(assets.map(async asset => {
    const assetDataUrl = await blobDataUrl(asset.blob);
    return { ...asset, dataUrl: assetDataUrl, mime: asset.blob.type || "image/png", base64: assetDataUrl.split(",")[1] ?? "" };
  }));
  const assetManifest = assetInputs.map(asset => `Asset ID ${asset.id}; source bounds x=${asset.bounds.x}, y=${asset.bounds.y}, width=${asset.bounds.w}, height=${asset.bounds.h}.`).join("\n");
  const geometry = layoutBlocks.slice(0, 180).map((block, index) => ({
    id: `source-${index}`,
    type: block.type,
    x: round(block.bbox.x), y: round(block.bbox.y), w: round(block.bbox.w), h: round(block.bbox.h),
    text: block.text?.replace(/\s+/g, " ").trim().slice(0, 500),
    font: block.font ? { family: block.font.family ?? block.font.name, size: block.font.size, weight: block.font.weight, style: block.font.style, color: block.font.color } : undefined,
  }));
  const semanticTree = contentTree.map(node => `${node.role}${node.level ? ` level=${node.level}` : ""} id=${node.id} ${JSON.stringify(node.text)}`).join("\n");
  const request = `${prompt}\n\nSource page dimensions: ${dimensions}. Define --source-width:${sourceWidth ?? 612};--source-height:${sourceHeight ?? 792} on data-litera-page.${fontFamily ? ` Use ${fontFamily} as the reading font.` : ""}${semanticTree ? `\n\nAUTHORITATIVE SEMANTIC CONTENT TREE (DOM order; reproduce every ID and its exact quoted text exactly once):\n${semanticTree}` : compactText ? `\n\nExact extracted text (use once, geometry controls layout):\n${compactText}` : ""}${geometry.length ? `\n\nExtracted geometry map in source-page coordinates (placement evidence only; it does not authorize image crops):\n${JSON.stringify(geometry)}` : ""}${assetManifest ? `\n\nPermitted original page assets:\n${assetManifest}` : "\n\nPermitted original page assets: none."}${styleguide ? `\n\nBOOK-LEVEL STYLEGUIDE (apply consistently on every page):\n${styleguide}` : ""}${userInstructions ? `\n\nADDITIONAL USER CORRECTIONS:\n${userInstructions}` : ""}`;
  const fingerprint = preparedFingerprint ?? await storyboardFingerprint(image, fontFamily, assets, layoutBlocks);
  let raw = "";
  let model = "";

  if (provider === "openai") {
    model = "gpt-5.4";
    raw = await callOpenAi(keys.openai, model, request, dataUrl, assetInputs, signal);
  } else if (provider === "gemini") {
    model = "gemini-2.5-pro";
    raw = await callGemini(keys.gemini, model, request, mime, base64, assetInputs, signal);
  } else if (provider === "anthropic") {
    model = "claude-3-5-sonnet-latest";
    raw = await callAnthropic(keys.anthropic, model, request, mime, base64, assetInputs, signal);
  } else {
    throw new Error("AI storyboard rendering currently supports OpenAI, Gemini, or Anthropic vision keys.");
  }
  const html = enforceStoryboardDocument(sanitizeStoryboardHtml(extractHtml(raw)), sourceWidth ?? 612, sourceHeight ?? 792);
  if (!html.includes("<body") || html.length < 160) throw new Error("The provider did not return a complete storyboard page.");
  const visibleText = (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, " ")
    .replace(/\s+/g, " ").trim();
  if (visibleText.length < 12) throw new Error("The provider returned a blank storyboard page. Litera rejected it instead of saving it.");
  if (!storyboardImagesAreReferenced(html, assets.map(asset => asset.id))) throw new Error("The provider attempted to use an unreferenced image or source-page crop. Litera rejected it instead of mixing screenshots with HTML.");
  return { html, model, provider, fingerprint };
}

export async function captionImagesWithAi({
  pageImage,
  assets,
  pageText,
  language,
  keys,
  provider,
  signal,
}: {
  pageImage: Blob;
  assets: AiStoryboardAsset[];
  pageText?: string;
  language: string;
  keys: ProviderKeys;
  provider: ProviderId;
  signal?: AbortSignal;
}): Promise<AiImageCaption[]> {
  if (!assets.length) return [];
  const pageDataUrl = await blobDataUrl(pageImage);
  const prepared = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      dataUrl: await blobDataUrl(asset.blob),
    })),
  );
  const request = `Describe each supplied textbook visual for a blind learner who will hear the caption through text-to-speech. Write every caption in the book's source language (${language}). Do not translate it into English unless ${language} is English.

Use the full page only as context. For every asset ID, state what is visibly depicted and any educationally important spatial relationship, labels, sequence, quantities, or action. Be concise but specific. Do not say only “image”, “illustration”, “figure”, “diagram”, “shown”, “accompanying”, or repeat a nearby question. Do not guess identity, emotion, colour, or meaning that is not visible. Return only valid JSON in this shape: {"captions":[{"imageId":"exact asset id","caption":"specific description"}]}.

Page text: ${(pageText ?? "").replace(/\s+/g, " ").trim().slice(0, 2500)}
Assets:\n${prepared.map((asset) => `${asset.id}: bounds x=${asset.bounds.x}, y=${asset.bounds.y}, width=${asset.bounds.w}, height=${asset.bounds.h}`).join("\n")}`;
  let raw: string;
  if (provider === "openai") {
    if (!keys.openai) throw new Error("Configure an OpenAI vision key before running Image Captioning.");
    const content = [
      { type: "input_text", text: request },
      { type: "input_image", image_url: pageDataUrl, detail: "high" },
      ...prepared.flatMap((asset) => [
        { type: "input_text", text: `Asset ${asset.id}` },
        { type: "input_image", image_url: asset.dataUrl, detail: "high" },
      ]),
    ];
    const response = await providerFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${keys.openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4", max_output_tokens: 3000, input: [{ role: "user", content }] }),
      signal,
    });
    const payload = await readProviderResponseJson<{ output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } }>(response, "OpenAI");
    if (!response.ok) throw new Error(payload.error?.message || "OpenAI could not caption these images.");
    raw = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
  } else if (provider === "gemini") {
    if (!keys.gemini) throw new Error("Configure a Gemini vision key before running Image Captioning.");
    const parts = [
      { inlineData: { mimeType: pageImage.type || "image/png", data: pageDataUrl.split(",")[1] ?? "" } },
      { text: request },
      ...prepared.flatMap((asset) => [
        { text: `Asset ${asset.id}` },
        { inlineData: { mimeType: asset.blob.type || "image/png", data: asset.dataUrl.split(",")[1] ?? "" } },
      ]),
    ];
    const response = await providerFetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": keys.gemini },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: "application/json" } }),
      signal,
    });
    const payload = await readProviderResponseJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } }>(response, "Gemini");
    if (!response.ok) throw new Error(payload.error?.message || "Gemini could not caption these images.");
    raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  } else if (provider === "anthropic") {
    if (!keys.anthropic) throw new Error("Configure an Anthropic vision key before running Image Captioning.");
    const content = [
      { type: "image", source: { type: "base64", media_type: pageImage.type || "image/png", data: pageDataUrl.split(",")[1] ?? "" } },
      { type: "text", text: request },
      ...prepared.flatMap((asset) => [
        { type: "text", text: `Asset ${asset.id}` },
        { type: "image", source: { type: "base64", media_type: asset.blob.type || "image/png", data: asset.dataUrl.split(",")[1] ?? "" } },
      ]),
    ];
    const response = await providerFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": keys.anthropic },
      body: JSON.stringify({ model: "claude-3-5-sonnet-latest", max_tokens: 3000, temperature: 0.1, messages: [{ role: "user", content }] }),
      signal,
    });
    const payload = await readProviderResponseJson<{ content?: Array<{ type: string; text?: string }>; error?: { message?: string } }>(response, "Anthropic");
    if (!response.ok) throw new Error(payload.error?.message || "Anthropic could not caption these images.");
    raw = payload.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "";
  } else {
    throw new Error("Image Captioning requires an OpenAI, Gemini, or Anthropic vision key.");
  }
  const parsed = parseCaptionPayload(raw);
  const requested = new Set(assets.map((asset) => asset.id));
  const captions = parsed.filter(
    (item) => requested.has(item.imageId) && item.caption.trim().length >= 12,
  );
  if (captions.length !== requested.size)
    throw new Error("The vision provider did not return a useful caption for every meaningful image.");
  return captions;
}

function parseCaptionPayload(raw: string): AiImageCaption[] {
  const value = parseProviderJson<{ captions?: unknown }>(raw);
  if (!Array.isArray(value.captions)) throw new Error("The vision provider returned invalid caption data.");
  return value.captions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { imageId?: unknown; caption?: unknown };
    return typeof candidate.imageId === "string" && typeof candidate.caption === "string"
      ? [{ imageId: candidate.imageId, caption: candidate.caption.trim() }]
      : [];
  });
}

export function storyboardImagesAreReferenced(html: string, assetIds: string[]) {
  const allowed = new Set(assetIds);
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match => match[1] ?? "");
  return sources.every(src => {
    if (!src.startsWith("litera-asset://")) return false;
    const id = decodeURIComponent(src.slice("litera-asset://".length)).replace(/\/+$/, "");
    return allowed.has(id);
  });
}

/** Reject model-created dark surfaces outside the sampled publication palette. */
export function storyboardPaletteIsSafe(html: string, palette: string[]) {
  const allowed = palette.filter(color => /^#[0-9a-f]{6}$/i.test(color));
  const classValues = [...html.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)].flatMap(match => (match[1] ?? "").split(/\s+/));
  if (classValues.some(token => /^(?:bg-|from-|via-|to-)?(?:black|gray-9\d\d|slate-9\d\d|zinc-9\d\d|neutral-9\d\d|stone-9\d\d)(?:\/\d+)?$/i.test(token))) return false;
  const hasWhiteText = classValues.some(token => /^(?:text-white|text-\[#f{3,8}\])$/i.test(token));
  const hasTranslucentSurface = classValues.some(token => /^(?:bg|from|via|to)-[^/]+\/(?:[0-6]?\d)$/i.test(token));
  if (hasWhiteText && hasTranslucentSurface) return false;
  const hasPaleGradientSurface = classValues.some(token => /^(?:from|via|to|bg)-(?:white|gray|slate|zinc|neutral|stone|green|emerald|teal)-(?:50|100|200|300)$/i.test(token));
  if (hasWhiteText && hasPaleGradientSurface) return false;
  const backgroundDeclarations = [...html.matchAll(/background(?:-color)?\s*:\s*([^;}]+)/gi)].map(match => match[1] ?? "");
  const backgroundColors = [
    ...backgroundDeclarations.flatMap(declaration => [...declaration.matchAll(/#[0-9a-f]{3,8}/gi)].map(match => match[0])),
    ...classValues.map(token => token.match(/^bg-\[(#[0-9a-f]{3,8})\]$/i)?.[1] ?? "").filter(Boolean),
  ];
  const whiteTextSignals = classValues.filter(token => /^(?:text-white|text-\[#f{3,8}\])$/i.test(token)).length
    + (html.match(/(?:^|[;{])\s*color\s*:\s*(?:#f{3,8}|white)\b/gi) ?? []).length;
  const darkClassSurfaces = classValues.filter(token => /^(?:bg|from|via|to)-(?:green|emerald|teal|blue|indigo|purple|red|orange|gray|slate|zinc|neutral|stone)-(?:600|700|800|900|950)(?:\/\d+)?$/i.test(token)).length;
  const darkCssSurfaces = backgroundColors.filter(color => {
    const normalized = normalizeOpaqueHex(color);
    return normalized ? relativeLuminance(normalized) < 0.2 : false;
  }).length;
  if (whiteTextSignals > darkClassSurfaces + darkCssSurfaces) return false;
  return backgroundColors.every(color => {
    const normalized = normalizeOpaqueHex(color);
    if (!normalized || relativeLuminance(normalized) >= 0.055) return true;
    return allowed.some(candidate => rgbDistance(normalized, candidate) < 58);
  });
}

function normalizeOpaqueHex(value: string) {
  const raw = value.slice(1);
  if (raw.length === 3) return `#${[...raw].map(character => character + character).join("")}`;
  if (raw.length === 6) return `#${raw}`;
  if (raw.length === 8 && Number.parseInt(raw.slice(6), 16) >= 230) return `#${raw.slice(0, 6)}`;
  return undefined;
}
function rgbDistance(left: string, right: string) {
  const a = hexChannels(left); const b = hexChannels(right);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function relativeLuminance(value: string) {
  const channels = hexChannels(value).map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function hexChannels(value: string) { return [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16)); }

function round(value: number) { return Math.round(value * 100) / 100; }

function enforceStoryboardDocument(value: string, width: number, height: number) {
  const pageCss = `<style id="litera-page-contract">html,body{margin:0;width:100%;min-height:100%;background:#e9eaec}body{display:flex;justify-content:center;align-items:flex-start;overflow-x:hidden}main[data-litera-page]{--source-width:${width};--source-height:${height};width:100%;min-height:100%;position:relative;flex:none;background:#fff;box-sizing:border-box}main[data-litera-page] *{box-sizing:border-box}img{max-width:100%;height:auto}</style>`;
  let html = value.replace(/<main\b(?![^>]*data-litera-page)([^>]*)>/i, `<main data-litera-page$1>`);
  if (!/<main\b[^>]*data-litera-page/i.test(html)) {
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main data-litera-page>${body}</main></body></html>`;
  }
  return html.replace(/<\/head>/i, `${pageCss}</head>`);
}

type PreparedAsset = AiStoryboardAsset & { dataUrl: string; mime: string; base64: string };

async function callOpenAi(key: string, model: string, text: string, imageUrl: string, assets: PreparedAsset[], signal?: AbortSignal) {
  if (!key) throw new Error("Unlock an OpenAI key before running Storyboard.");
  const content = [{ type: "input_text", text }, { type: "input_image", image_url: imageUrl, detail: "high" }, ...assets.flatMap(asset => [{ type: "input_text", text: `Original visual asset ${asset.id}` }, { type: "input_image", image_url: asset.dataUrl, detail: "high" }])];
  const response = await providerFetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, reasoning: { effort: "medium" }, max_output_tokens: 12000, input: [{ role: "user", content }] }), signal });
  const data = await readProviderResponseJson<{ output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } }>(response, "OpenAI");
  if (!response.ok) throw new Error(data.error?.message || "OpenAI could not render this page.");
  return data.output_text ?? data.output?.flatMap(item => item.content ?? []).map(item => item.text ?? "").join("") ?? "";
}

async function callGemini(key: string, model: string, text: string, mimeType: string, data: string, assets: PreparedAsset[], signal?: AbortSignal) {
  if (!key) throw new Error("Unlock a Gemini key before running Storyboard.");
  const parts = [{ inlineData: { mimeType, data } }, { text }, ...assets.flatMap(asset => [{ text: `Original visual asset ${asset.id}` }, { inlineData: { mimeType: asset.mime, data: asset.base64 } }])];
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 12000 } }), signal });
  const payload = await readProviderResponseJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } }>(response, "Gemini");
  if (!response.ok) throw new Error(payload.error?.message || "Gemini could not render this page.");
  return payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
}

async function callAnthropic(key: string, model: string, text: string, mediaType: string, data: string, assets: PreparedAsset[], signal?: AbortSignal) {
  if (!key) throw new Error("Unlock an Anthropic key before running Storyboard.");
  const content = [{ type: "image", source: { type: "base64", media_type: mediaType, data } }, { type: "text", text }, ...assets.flatMap(asset => [{ type: "text", text: `Original visual asset ${asset.id}` }, { type: "image", source: { type: "base64", media_type: asset.mime, data: asset.base64 } }])];
  const response = await providerFetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": key }, body: JSON.stringify({ model, max_tokens: 12000, temperature: 0.2, messages: [{ role: "user", content }] }), signal });
  const payload = await readProviderResponseJson<{ content?: Array<{ type: string; text?: string }>; error?: { message?: string } }>(response, "Anthropic");
  if (!response.ok) throw new Error(payload.error?.message || "Anthropic could not render this page.");
  return payload.content?.filter(item => item.type === "text").map(item => item.text ?? "").join("") ?? "";
}

function extractHtml(value: string) {
  const fenced = value.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? value).trim();
  const start = candidate.search(/<!doctype|<html/i);
  return start >= 0 ? candidate.slice(start) : candidate;
}

export function sanitizeStoryboardHtml(value: string) {
  return value
    .replace(/<(script|iframe|object|embed|link|meta)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(src|href)\s*=\s*("|')\s*(?:https?:|javascript:|data:text\/html)[\s\S]*?\2/gi, "")
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "")
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => `<style>${css.replace(/expression\s*\([^)]*\)/gi, "")}</style>`);
}

export function hydrateStoryboardAssets(html: string, imageUrls: Record<string, string>) {
  const fallbacks = Object.values(imageUrls);
  let fallbackIndex = 0;
  const resolved = html.replace(/litera-asset:\/\/([^"'()\s<>]+)/g, (match, rawId: string) => {
    const id = decodeURIComponent(rawId).replace(/\/+$/, "");
    const exact = imageUrls[id];
    if (exact) return exact;
    const normalized = Object.entries(imageUrls).find(([candidate]) => id.startsWith(candidate) || candidate.startsWith(id))?.[1];
    return normalized ?? fallbacks[fallbackIndex++] ?? match;
  });
  return resolved.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2/gi, (tag, prefix: string, quote: string, src: string) => {
    if (/^(?:data:image\/|blob:)/i.test(src)) return tag;
    const id = src.replace(/^litera-asset:\/\//i, "").replace(/\/+$/, "");
    const exact = imageUrls[id];
    const normalized = Object.entries(imageUrls).find(([candidate]) => id.includes(candidate) || candidate.includes(id))?.[1];
    const replacement = exact ?? normalized ?? fallbacks[fallbackIndex++];
    return replacement ? `${prefix}${quote}${replacement}${quote}` : tag;
  });
}

function blobDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }

async function providerFetch(input: string, init: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    init.signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(90_000);
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeout])
        : timeout;
      const request = { ...init, signal };
      const response = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
        ? await (await import("@tauri-apps/plugin-http")).fetch(input, request)
        : await fetch(input, request);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === 2) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await abortableDelay(700 * (2 ** attempt), init.signal ?? undefined);
  }
  throw lastError instanceof Error ? lastError : new Error("The AI provider request failed after three attempts.");
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Stopped", "AbortError"));
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
    function finish() { signal?.removeEventListener("abort", abort); resolve(); }
    function abort() { clearTimeout(timer); reject(signal?.reason ?? new DOMException("Stopped", "AbortError")); }
  });
}

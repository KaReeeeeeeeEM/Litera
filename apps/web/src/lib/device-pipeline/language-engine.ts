import type { DeviceBook, ReadingLevel, TextCatalogEntry } from "@/components/device/device-types";
import type { ProviderId, ProviderKeys } from "@/components/device/provider-vault";
import { parseProviderJson } from "@/lib/device-pipeline/provider-json";
import { collapseRepeatedDisplayText } from "@/lib/device-pipeline/text-layer-deduplication";

const BATCH_SIZE = 50;
const EASY_READ_BATCH_SIZE = 20;
const translationInstruction = `Translate textbook catalog entries faithfully and naturally. Preserve meaning, names, numbers, terminology, punctuation, placeholders, and formatting markers. Return exactly one complete translation for every input, in the same order. Do not summarize, omit, combine, explain, or add content.`;

export function buildTextCatalog(book: DeviceBook): TextCatalogEntry[] {
  const entries: TextCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const page of book.storyboardPages ?? []) {
    type Candidate = TextCatalogEntry & {
      x: number;
      y: number;
      w: number;
      h: number;
      order: number;
      aliases: string[];
    };
    const candidates: Candidate[] = [];
    const seenPagePlacement = new Map<
      string,
      Array<{ x: number; y: number; w: number; h: number }>
    >();
    const width = Math.max(1, page.sourceWidth ?? 100);
    const height = Math.max(1, page.sourceHeight ?? 100);
    const generatedContentsPage = /class=["'][^"']*digital-toc\b/.test(page.html);
    for (const [index, block] of page.blocks.filter((block) => !generatedContentsPage && !block.hidden && block.content.trim()).entries()) {
      const id = block.id || `pg${pad(page.pageNumber)}_tx${pad(index + 1)}`;
      const visualText = block.kind === "image" ? block.accessibleLabel || block.content : block.content;
      const normalizedVisualText = visualText.replace(/\s+/g, " ").trim();
      const text = block.kind === "heading" ? collapseRepeatedDisplayText(normalizedVisualText) : normalizedVisualText;
      if (block.kind === "image" && isGenericVisualNarration(text)) continue;
      candidates.push({
        id,
        text,
        pageNumber: page.pageNumber,
        x: block.sourceBounds ? (block.sourceBounds.x / width) * 100 : 0,
        y: block.sourceBounds ? (block.sourceBounds.y / height) * 100 : 10_000 + block.order,
        w: block.sourceBounds ? (block.sourceBounds.w / width) * 100 : 0,
        h: block.sourceBounds ? (block.sourceBounds.h / height) * 100 : 0,
        order: block.order,
        aliases: [block.id, block.assetId].filter((value): value is string => Boolean(value)),
      });
    }
    if (typeof DOMParser !== "undefined") {
      const document = new DOMParser().parseFromString(page.html, "text/html");
      const selector = "[data-id],[data-block-id],[data-layout-block],[data-asset-id]";
      const elements = [...document.querySelectorAll<HTMLElement>(selector)].filter(
        (element) => !element.querySelector(selector) && element.tagName !== "IMG" && element.getAttribute("aria-hidden") !== "true",
      );
      const refinedCandidates = new Set<Candidate>();
      for (const [index, element] of elements.entries()) {
        const figureCaption = element.tagName === "FIGURE"
          ? element.querySelector("figcaption")?.textContent || element.querySelector("img")?.getAttribute("alt")
          : undefined;
        const rawText = (figureCaption ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
        const text = /^(?:H[1-6]|HEADER)$/.test(element.tagName) ? collapseRepeatedDisplayText(rawText) : rawText;
        const id = element.dataset.id || element.dataset.blockId || element.dataset.assetId || `pg${pad(page.pageNumber)}_dom${pad(index + 1)}`;
        if (!text) continue;
        let matching = candidates.find((candidate) => candidate.id === id || candidate.aliases.includes(id));
        const x = percentagePosition(element.style.left);
        const y = percentagePosition(element.style.top);
        const w = percentagePosition(element.style.width);
        const h = percentagePosition(element.style.height);
        if (!matching) {
          // Some blocks never get an id that matches what actually rendered
          // (e.g. a heading's own generated id vs. the DOM's data-id), so
          // they never reach the reading-order fix below and are instead
          // read last regardless of where they visually sit on the page -
          // this is what produces reading a later heading before an
          // earlier paragraph. A candidate whose exact text is unique on
          // this page is just as reliable a correlation as its id.
          const textMatches = candidates.filter(
            (candidate) => !refinedCandidates.has(candidate) && candidate.text === text,
          );
          if (textMatches.length) {
            // A rendered source run can have a generated DOM id that differs
            // from its extracted block id. Correlate repeated text by visual
            // position; without geometry, consume the next unmatched source
            // occurrence instead of inventing another narration entry.
            matching = [...textMatches].sort((a, b) => {
              if (x === undefined || y === undefined) return a.order - b.order;
              return (
                Math.hypot(a.x - x, a.y - y) -
                  Math.hypot(b.x - x, b.y - y) ||
                a.order - b.order
              );
            })[0];
          }
        }
        if (matching) {
          if (x !== undefined) matching.x = x;
          if (y !== undefined) matching.y = y;
          if (w !== undefined) matching.w = w;
          if (h !== undefined) matching.h = h;
          refinedCandidates.add(matching);
          continue;
        }
        candidates.push({ id, text, pageNumber: page.pageNumber, x: x ?? 0, y: y ?? 20_000 + index, w: w ?? 0, h: h ?? 0, order: page.blocks.length + index, aliases: [id] });
      }
    }
    candidates.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1.25) return a.y - b.y;
      return a.x - b.x || a.order - b.order;
    });
    for (const candidate of candidates) {
      const textKey = normalizeCatalogText(candidate.text);
      const priorPlacements = seenPagePlacement.get(textKey) ?? [];
      const isCoincidentDuplicate = priorPlacements.some((placement) => {
        const horizontalTolerance = Math.max(1.1, Math.min(placement.w, candidate.w) * 0.25);
        const verticalTolerance = Math.max(1.1, Math.min(placement.h, candidate.h) * 0.45);
        return (
          Math.abs(placement.x - candidate.x) <= horizontalTolerance &&
          Math.abs(placement.y - candidate.y) <= verticalTolerance
        );
      });
      if (!textKey || seen.has(candidate.id) || isCoincidentDuplicate) continue;
      seen.add(candidate.id);
      priorPlacements.push({ x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h });
      seenPagePlacement.set(textKey, priorPlacements);
      entries.push({ id: candidate.id, text: candidate.text, pageNumber: candidate.pageNumber });
    }
  }
  return entries;
}

function percentagePosition(value: string) {
  if (!value.endsWith("%")) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeCatalogText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function isGenericVisualNarration(value: string) {
  return /^(?:illustration\s+(?:for|on|accompanying)\b|visual\s+(?:awaiting|used|on)\b|mchoro\s+unaotumika\b)/i.test(value.trim());
}

export async function translateCatalog({ entries, sourceLanguage, targetLanguage, keys, provider, signal, onBatch }: { entries: TextCatalogEntry[]; sourceLanguage: string; targetLanguage: string; keys: ProviderKeys; provider: ProviderId; signal?: AbortSignal; onBatch?: (translated: TextCatalogEntry[]) => Promise<void> }): Promise<TextCatalogEntry[]> {
  const output: TextCatalogEntry[] = [];
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const texts = batch.map((entry, index) => ({ index, text: entry.text }));
    const request = `${translationInstruction}\n\nSource language: ${sourceLanguage}. Target language: ${targetLanguage}.\n\nEntries:\n${JSON.stringify(texts)}`;
    const translations = await requestTranslations(provider, keys, request, signal);
    if (translations.length !== batch.length) throw new Error(`Expected ${batch.length} translations but received ${translations.length}.`);
    const translated = batch.map((entry, index) => ({ ...entry, text: translations[index]!.trim() }));
    output.push(...translated);
    await onBatch?.(output);
  }
  return output;
}

export async function adaptCatalogForReadingLevel({ entries, language, level, keys, provider, signal, onProgress }: { entries: TextCatalogEntry[]; language: string; level: ReadingLevel; keys: ProviderKeys; provider: ProviderId; signal?: AbortSignal; onProgress?: (completed: number, total: number) => Promise<void> }): Promise<TextCatalogEntry[]> {
  const guidance: Record<ReadingLevel, string> = {
    early: "Use short sentences and familiar concrete words for an early primary reader. Explain unavoidable terms simply. Prefer one idea per sentence.",
    middle: "Use clear sentences and everyday vocabulary for a developing primary or middle-grade reader. Explain difficult terms without removing important facts.",
    late: "Use concise, plain language for a confident late-stage reader. Preserve necessary subject vocabulary and explain technical relationships clearly.",
  };
  const seen = new Set<string>();
  const uniqueEntries = entries.filter((entry) => {
    const key = normalizeCatalogText(entry.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const adaptedByText = new Map<string, string>();
  for (let offset = 0; offset < uniqueEntries.length; offset += EASY_READ_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = uniqueEntries.slice(offset, offset + EASY_READ_BATCH_SIZE);
    const request = `Rewrite each textbook catalog entry as an Easy Read alternative in the same language (${language}). ${guidance[level]} Preserve meaning, names, numbers, mathematical expressions, answer choices, and factual details. Captions describing images must remain useful to a blind reader. Return exactly one rewritten text for every input in the same order.\n\nEntries:\n${JSON.stringify(batch.map((entry, index) => ({ index, text: entry.text })))}`;
    const texts = await requestTranslations(provider, keys, request, signal);
    if (texts.length !== batch.length)
      throw new Error(`Expected ${batch.length} Easy Read texts but received ${texts.length}.`);
    batch.forEach((entry, index) => {
      adaptedByText.set(
        normalizeCatalogText(entry.text),
        texts[index]!.replace(/\s+/g, " ").trim(),
      );
    });
    await onProgress?.(
      Math.min(offset + batch.length, uniqueEntries.length),
      uniqueEntries.length,
    );
  }
  return entries.map((entry) => ({
    ...entry,
    id: `easy-${entry.id}`,
    text: adaptedByText.get(normalizeCatalogText(entry.text)) ?? entry.text,
  }));
}

function pad(value: number) { return String(value).padStart(3, "0"); }

async function requestTranslations(provider: ProviderId, keys: ProviderKeys, prompt: string, signal?: AbortSignal): Promise<string[]> {
  if (provider === "gemini" && keys.gemini) {
    const response = await providerFetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": keys.gemini }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { translations: { type: "ARRAY", items: { type: "STRING" } } }, required: ["translations"] } } }), signal });
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || "Gemini could not translate this catalog batch.");
    return parseTranslations(body.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "");
  }
  if (provider === "anthropic" && keys.anthropic) {
    const response = await providerFetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": keys.anthropic }, body: JSON.stringify({ model: "claude-3-5-sonnet-latest", max_tokens: 12000, temperature: 0.1, messages: [{ role: "user", content: `${prompt}\n\nReturn JSON only: {\"translations\":[...]}` }] }), signal });
    const body = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || "Anthropic could not translate this catalog batch.");
    return parseTranslations(body.content?.filter(item => item.type === "text").map(item => item.text ?? "").join("") ?? "");
  }
  if (provider === "openai" && keys.openai) {
    const response = await providerFetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${keys.openai}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.4", reasoning: { effort: "medium" }, max_output_tokens: 12000, input: `${prompt}\n\nReturn JSON only: {\"translations\":[...]}` }), signal });
    const body = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || "OpenAI could not translate this catalog batch.");
    return parseTranslations(body.output_text ?? body.output?.flatMap(item => item.content ?? []).map(item => item.text ?? "").join("") ?? "");
  }
  throw new Error("Choose an unlocked OpenAI, Gemini, or Anthropic provider for translation.");
}

async function providerFetch(input: string, init: RequestInit) {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? (await import("@tauri-apps/plugin-http")).fetch(input, init)
    : fetch(input, init);
}

function parseTranslations(value: string) {
  const parsed = parseProviderJson<{ translations?: unknown }>(value);
  if (!Array.isArray(parsed.translations) || !parsed.translations.every(item => typeof item === "string")) throw new Error("The translation provider returned an invalid catalog response.");
  return parsed.translations;
}

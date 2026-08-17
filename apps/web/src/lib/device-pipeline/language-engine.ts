import type { DeviceBook, TextCatalogEntry } from "@/components/device/device-types";
import type { ProviderId, ProviderKeys } from "@/components/device/provider-vault";

const BATCH_SIZE = 50;
const translationInstruction = `Translate textbook catalog entries faithfully and naturally. Preserve meaning, names, numbers, terminology, punctuation, placeholders, and formatting markers. Return exactly one complete translation for every input, in the same order. Do not summarize, omit, combine, explain, or add content.`;

export function buildTextCatalog(book: DeviceBook): TextCatalogEntry[] {
  const entries: TextCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const page of book.storyboardPages ?? []) {
    const document = new DOMParser().parseFromString(page.html, "text/html");
    const elements = [...document.querySelectorAll<HTMLElement>("[data-id]")].filter(element => !element.querySelector("[data-id]") && element.tagName !== "IMG");
    for (const [index, element] of elements.entries()) {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const id = element.dataset.id || `pg${pad(page.pageNumber)}_tx${pad(index + 1)}`;
      if (!text || seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, text, pageNumber: page.pageNumber });
    }
    if (elements.length) continue;
    for (const [index, block] of page.blocks.filter(block => !block.hidden && block.content.trim()).entries()) {
      const id = block.id || `pg${pad(page.pageNumber)}_tx${pad(index + 1)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, text: block.content.replace(/\s+/g, " ").trim(), pageNumber: page.pageNumber });
    }
  }
  return entries;
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
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value;
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 && end >= start ? fenced.slice(start, end + 1) : fenced) as { translations?: unknown };
  if (!Array.isArray(parsed.translations) || !parsed.translations.every(item => typeof item === "string")) throw new Error("The translation provider returned an invalid catalog response.");
  return parsed.translations;
}

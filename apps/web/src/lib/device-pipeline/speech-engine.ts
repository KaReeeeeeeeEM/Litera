import type { ProviderId, ProviderKeys } from "@/components/device/provider-vault";
import type { SpeechEntry, TextCatalogEntry } from "@/components/device/device-types";

export function isSpeakableText(text: string) { return text.replace(/[\p{P}\p{S}\s]/gu, "").length > 0; }
export function prepareTextForSpeech(text: string, language?: string) {
  const cleaned = normalizeDottedPageReferences(text, language)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return language?.toLowerCase().startsWith("sw")
    ? localizeSwahiliNumbers(cleaned)
    : cleaned;
}

export async function synthesizeCatalogEntry({ entry, language, provider, keys, voice, speed, instructions, signal }: { entry: TextCatalogEntry; language: string; provider: ProviderId; keys: ProviderKeys; voice: string; speed: number; instructions?: string; signal?: AbortSignal }): Promise<SpeechEntry> {
  const text = prepareTextForSpeech(entry.text, language);
  if (!isSpeakableText(text)) throw new Error(`Catalog entry ${entry.id} has no speakable text.`);
  let audio: Blob;
  if (provider === "openai" && keys.openai) {
    const response = await providerFetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { Authorization: `Bearer ${keys.openai}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: openAiVoice(voice), input: text, instructions: speechInstructions(language, instructions), speed, response_format: "mp3" }), signal });
    if (!response.ok) throw new Error((await safeProviderError(response)) || "OpenAI could not generate speech.");
    audio = await response.blob();
  } else if (provider === "gemini" && keys.gemini) {
    const prompt = `${speechInstructions(language, instructions)}\n\nRead only this text aloud:\n${text}`;
    const response = await providerFetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": keys.gemini }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice(voice) } } } } }), signal });
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || "Gemini could not generate speech.");
    const inline = body.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error("Gemini returned no speech audio.");
    const pcm = Uint8Array.from(atob(inline.data), character => character.charCodeAt(0));
    audio = inline.mimeType?.includes("wav") ? new Blob([pcm], { type: "audio/wav" }) : pcmToWav(pcm, 24_000);
  } else throw new Error("Speech requires an unlocked OpenAI or Gemini key.");
  const durationMs = estimateDuration(text, speed);
  return { id: `${language}:${entry.id}`, textId: entry.id, language, pageNumber: entry.pageNumber, inputText: text, voice, speed, audio, durationMs, words: estimateWordTimestamps(text, durationMs) };
}

function estimateDuration(text: string, speed: number) { return Math.max(500, Math.round(text.split(/\s+/).length / (2.6 * speed) * 1000)); }
function estimateWordTimestamps(text: string, durationMs: number) { const words = text.split(/\s+/).filter(Boolean); const unit = durationMs / Math.max(1, words.length); return words.map((word, index) => ({ word, startMs: Math.round(index * unit), endMs: Math.round((index + 1) * unit) })); }
function openAiVoice(value: string) { return ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"].includes(value) ? value : "alloy"; }
function geminiVoice(value: string) { return ["Kore", "Puck", "Aoede", "Charon", "Fenrir"].includes(value) ? value : "Kore"; }
function speechInstructions(language: string, editorInstructions?: string) {
  const locale = language || "the text's language";
  const base = `Speak naturally and consistently in ${locale}. Pronounce every number, Roman numeral, symbol, unit, and mathematical expression in that same language; never switch to English. A dotted leader followed by digits is a number reference, and one followed by Roman-numeral letters is a Roman numeral reference; do not read the dots.`;
  return editorInstructions?.trim()
    ? `${base} Follow this pronunciation or delivery direction without changing or adding spoken content: ${editorInstructions.trim()}`
    : base;
}

const referenceLabels: Record<string, { number: string; roman: string }> = {
  en: { number: "number", roman: "Roman numeral" },
  sw: { number: "nambari", roman: "nambari ya Kirumi" },
  fr: { number: "numéro", roman: "chiffre romain" },
  es: { number: "número", roman: "número romano" },
  pt: { number: "número", roman: "algarismo romano" },
  de: { number: "Nummer", roman: "römische Zahl" },
  ar: { number: "الرقم", roman: "الرقم الروماني" },
  hi: { number: "संख्या", roman: "रोमन अंक" },
  zh: { number: "数字", roman: "罗马数字" },
  ja: { number: "数字", roman: "ローマ数字" },
};

export function normalizeDottedPageReferences(text: string, language?: string) {
  const baseLanguage = language?.toLowerCase().split(/[-_]/)[0] || "en";
  const labels = referenceLabels[baseLanguage] ?? referenceLabels.en!;
  return text.replace(
    /\.{2,}\s*([IVXLCDM]+|\d[\d,]*)\b/gi,
    (_, reference: string) => {
      const roman = /^[IVXLCDM]+$/i.test(reference);
      return `. ${roman ? labels.roman : labels.number} ${reference}`;
    },
  );
}

function localizeSwahiliNumbers(text: string) {
  return text.replace(/-?\d[\d,]*(?:\.\d+)?/g, (token) => {
    const negative = token.startsWith("-");
    const unsigned = token.replace(/^-/, "").replace(/,/g, "");
    const [integerPart, decimalPart] = unsigned.split(".");
    const integer = Number(integerPart);
    if (!Number.isSafeInteger(integer)) return token;
    const integerWords = swahiliInteger(integer);
    const decimalWords = decimalPart
      ? ` nukta ${[...decimalPart].map((digit) => swahiliDigit(Number(digit))).join(" ")}`
      : "";
    return `${negative ? "hasi " : ""}${integerWords}${decimalWords}`;
  });
}

function swahiliInteger(value: number): string {
  if (value === 0) return "sifuri";
  const scales = [
    [1_000_000_000, "bilioni"],
    [1_000_000, "milioni"],
    [1_000, "elfu"],
  ] as const;
  for (const [scale, label] of scales) {
    if (value >= scale) {
      const whole = Math.floor(value / scale);
      const remainder = value % scale;
      const joiner = remainder > 0 && remainder < 100 ? " na " : " ";
      return `${label} ${swahiliInteger(whole)}${remainder ? `${joiner}${swahiliInteger(remainder)}` : ""}`;
    }
  }
  if (value >= 100) {
    const whole = Math.floor(value / 100);
    const remainder = value % 100;
    return `mia ${swahiliInteger(whole)}${remainder ? ` na ${swahiliInteger(remainder)}` : ""}`;
  }
  if (value >= 20) {
    const tens = ["", "", "ishirini", "thelathini", "arobaini", "hamsini", "sitini", "sabini", "themanini", "tisini"];
    const remainder = value % 10;
    return `${tens[Math.floor(value / 10)]}${remainder ? ` na ${swahiliDigit(remainder)}` : ""}`;
  }
  const small = ["sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa", "kumi", "kumi na moja", "kumi na mbili", "kumi na tatu", "kumi na nne", "kumi na tano", "kumi na sita", "kumi na saba", "kumi na nane", "kumi na tisa"];
  return small[value]!;
}

function swahiliDigit(value: number) {
  return ["sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa"][value]!;
}
async function providerFetch(input: string, init: RequestInit) {
  const timeout = AbortSignal.timeout(60_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const request = { ...init, signal };
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? (await import("@tauri-apps/plugin-http")).fetch(input, request)
    : fetch(input, request);
}
async function safeProviderError(response: Response) { try { const body = await response.json() as { error?: { message?: string } }; return body.error?.message; } catch { return undefined; } }
function pcmToWav(pcm: Uint8Array, sampleRate: number) { const buffer = new ArrayBuffer(44 + pcm.byteLength); const view = new DataView(buffer); const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0))); write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.byteLength, true); new Uint8Array(buffer, 44).set(pcm); return new Blob([buffer], { type: "audio/wav" }); }

import type { ProviderId, ProviderKeys } from "@/components/device/provider-vault";
import type { SpeechEntry, TextCatalogEntry } from "@/components/device/device-types";

export function isSpeakableText(text: string) { return text.replace(/[\p{P}\p{S}\s]/gu, "").length > 0; }
export function prepareTextForSpeech(text: string, language?: string) {
  const cleaned = normalizeDottedPageReferences(text, language)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, (symbol) =>
      symbol === "©" || symbol === "®" || symbol === "™" ? symbol : "",
    )
    .replace(/\s+/g, " ")
    .trim();
  // PDFs frequently contain the same visible title on three coincident text
  // layers. It must remain visible once, and it must never be narrated three
  // times. Requiring at least three adjacent copies protects intentional
  // doubles such as "bye bye".
  const deduplicated = cleaned.replace(
    /\b([\p{L}\p{N}][\p{L}\p{N}'’.-]*)(?:\s+\1){2,}\b/giu,
    "$1",
  );
  return language?.toLowerCase().startsWith("sw")
    ? localizeSwahiliNumbers(deduplicated)
    : deduplicated;
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
  // Network response Blobs may be backed by a temporary file in Chromium and
  // desktop WebViews. Once the response/transcription lifecycle ends that
  // backing file can disappear, causing IndexedDB to reject an otherwise valid
  // speech checkpoint with `InvalidBlob`. Materialize owned bytes before the
  // Blob is aligned or persisted so every narration asset is durable.
  audio = await durableAudioBlob(audio);
  let durationMs = estimateDuration(text, speed);
  let words = estimateWordTimestamps(text, durationMs);
  if (keys.openai) {
    try {
      const aligned = await transcribeWordTimestamps(audio, keys.openai, signal);
      if (aligned.length) {
        words = aligned;
        durationMs = aligned.at(-1)?.endMs ?? durationMs;
      }
    } catch {
      // A failed alignment must not discard otherwise usable narration. The
      // duration-scaled estimate remains available as an explicit fallback.
    }
  }
  return { id: `${language}:${entry.id}`, textId: entry.id, language, pageNumber: entry.pageNumber, inputText: text, voice, speed, audio, audioBytes: await audio.arrayBuffer(), durationMs, words };
}

async function durableAudioBlob(audio: Blob) {
  if (!(audio instanceof Blob) || audio.size === 0)
    throw new Error("The speech provider returned an empty audio asset.");
  return new Blob([await audio.arrayBuffer()], {
    type: audio.type || "audio/mpeg",
  });
}

function estimateDuration(text: string, speed: number) { return Math.max(500, Math.round(text.split(/\s+/).length / (2.6 * speed) * 1000)); }
function estimateWordTimestamps(text: string, durationMs: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((word) =>
    Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, "").length * 0.22) +
    (/[.!?;:]$/.test(word) ? 1.15 : /[,]$/.test(word) ? 0.55 : 0),
  );
  const totalWeight = Math.max(1, weights.reduce((sum, weight) => sum + weight, 0));
  let cursor = 0;
  return words.map((word, index) => {
    const startMs = Math.round((cursor / totalWeight) * durationMs);
    cursor += weights[index]!;
    return { word, startMs, endMs: Math.round((cursor / totalWeight) * durationMs) };
  });
}
async function transcribeWordTimestamps(audio: Blob, apiKey: string, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", audio, audio.type.includes("wav") ? "speech.wav" : "speech.mp3");
  body.append("model", "whisper-1");
  body.append("response_format", "verbose_json");
  body.append("timestamp_granularities[]", "word");
  const response = await providerFetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    signal,
  });
  if (!response.ok) throw new Error((await safeProviderError(response)) || "OpenAI could not align speech timestamps.");
  const payload = await response.json() as { words?: Array<{ word?: string; start?: number; end?: number }> };
  return parseAlignedWords(payload.words);
}

export function parseAlignedWords(words?: Array<{ word?: string; start?: number; end?: number }>) {
  return (words ?? []).flatMap((word) => {
    const text = word.word?.trim();
    if (!text || !Number.isFinite(word.start) || !Number.isFinite(word.end)) return [];
    return [{ word: text, startMs: Math.round(word.start! * 1000), endMs: Math.round(word.end! * 1000) }];
  });
}
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timeout = AbortSignal.timeout(60_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const request = { ...init, signal };
    try {
      const response = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
        ? await (await import("@tauri-apps/plugin-http")).fetch(input, request)
        : await fetch(input, request);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2)
        return response;
    } catch (error) {
      if (init.signal?.aborted || attempt === 2) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1_200 * (attempt + 1));
      init.signal?.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(init.signal?.reason);
      }, { once: true });
    });
  }
  throw new Error("The speech provider did not respond after several attempts.");
}
async function safeProviderError(response: Response) { try { const body = await response.json() as { error?: { message?: string } }; return body.error?.message; } catch { return undefined; } }
function pcmToWav(pcm: Uint8Array, sampleRate: number) { const buffer = new ArrayBuffer(44 + pcm.byteLength); const view = new DataView(buffer); const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0))); write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.byteLength, true); new Uint8Array(buffer, 44).set(pcm); return new Blob([buffer], { type: "audio/wav" }); }

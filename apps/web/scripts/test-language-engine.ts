import assert from "node:assert/strict";
import { buildTextCatalog, translateCatalog } from "../src/lib/device-pipeline/language-engine";
import { parseProviderJson, readProviderResponseJson } from "../src/lib/device-pipeline/provider-json";

assert.deepEqual(
  parseProviderJson<{ translations: string[] }>(
    'Here is the result: ```json\n{translations:["Moja","Mbili",],}\n```',
  ).translations,
  ["Moja", "Mbili"],
  "provider JSON parsing must tolerate fences, prose, unquoted keys, and trailing commas",
);

const deduplicatedCatalog = buildTextCatalog({
  storyboardPages: [{
    pageNumber: 1,
    status: "ready",
    storyboardedAt: new Date(0).toISOString(),
    title: "Arithmetic",
    layout: "reading",
    html: '<main><h1 data-id="arithmetic-dom">Arithmetic</h1><p data-id="subtitle-dom">Pupil’s Book</p></main>',
    sourceMasks: [],
    blocks: [
      { id: "arithmetic-late", kind: "heading", content: "Arithmetic", order: 2, sourceBounds: { x: 50, y: 100, w: 160, h: 30 } },
      { id: "subtitle", kind: "text", content: "Pupil’s Book", order: 3, sourceBounds: { x: 50, y: 150, w: 140, h: 20 } },
      { id: "arithmetic-duplicate", kind: "heading", content: "Arithmetic", order: 0, sourceBounds: { x: 50, y: 100, w: 160, h: 30 } },
      { id: "arithmetic-shadow", kind: "heading", content: "Arithmetic", order: 1, sourceBounds: { x: 51, y: 102, w: 160, h: 30 } },
    ],
  }],
} as unknown as Parameters<typeof buildTextCatalog>[0]);
assert.deepEqual(
  deduplicatedCatalog.map((entry) => entry.text),
  ["Arithmetic", "Pupil’s Book"],
  "catalog construction must follow visual order and suppress repeated semantic/DOM copies before TTS",
);

const keys = { openai: "", gemini: "test", anthropic: "", azure: "", azureEndpoint: "", azureDeployment: "", custom: "", customEndpoint: "" };
const source = [
  { id: "pg001_tx001", text: "Mazingira yetu", pageNumber: 1 },
  { id: "pg001_tx002", text: "Tunapanda miti.", pageNumber: 1 },
];

const completePageCatalog = buildTextCatalog({
  storyboardPages: [
    {
      pageNumber: 20,
      status: "ready",
      storyboardedAt: new Date(0).toISOString(),
      title: "Exercise 2",
      layout: "activity",
      html: '<main><figure data-id="asset-1"><figcaption>Three oranges arranged in a row.</figcaption></figure></main>',
      sourceMasks: [],
      blocks: [
        { id: "page-20-text-0", kind: "heading", content: "Exercise 2", order: 0 },
        { id: "page-20-text-1", kind: "text", content: "Write the following numbers in numerals.", order: 1 },
        { id: "page-20-text-2", kind: "text", content: "two", order: 2 },
        { id: "page-20-math-0", kind: "text", content: "2 + 3 = 5", order: 3 },
        { id: "page-20-figure-0", kind: "image", content: "Three oranges arranged in a row.", order: 4, assetId: "asset-1" },
      ],
    },
  ],
} as unknown as Parameters<typeof buildTextCatalog>[0]);
assert.deepEqual(
  completePageCatalog.map((entry) => entry.text),
  [
    "Exercise 2",
    "Write the following numbers in numerals.",
    "two",
    "2 + 3 = 5",
    "Three oranges arranged in a row.",
  ],
  "speech catalogs must include the whole page in reading order, not only image captions",
);

const interleavedFigureCatalog = buildTextCatalog({
  storyboardPages: [{
    pageNumber: 9,
    status: "ready",
    storyboardedAt: new Date(0).toISOString(),
    title: "Count the fruit",
    layout: "activity",
    sourceWidth: 600,
    sourceHeight: 800,
    html: "<main></main>",
    blocks: [
      { id: "prompt", kind: "text", content: "Count the fruit.", order: 0, sourceBounds: { x: 40, y: 80, w: 200, h: 30 } },
      { id: "answer", kind: "activity", content: "Write your answer.", order: 1, sourceBounds: { x: 40, y: 600, w: 200, h: 30 } },
      { id: "fruit-image", kind: "image", content: "Three oranges in a row.", order: 99, sourceBounds: { x: 40, y: 250, w: 300, h: 220 } },
    ],
  }],
} as unknown as Parameters<typeof buildTextCatalog>[0]);
assert.deepEqual(
  interleavedFigureCatalog.map((entry) => entry.text),
  ["Count the fruit.", "Three oranges in a row.", "Write your answer."],
  "figure narration must remain at its visual position instead of being appended after page text",
);

const usefulVisualsOnly = buildTextCatalog({
  storyboardPages: [{
    pageNumber: 25,
    status: "ready",
    storyboardedAt: new Date(0).toISOString(),
    title: "Recognising number zero",
    layout: "visual",
    html: "<main></main>",
    sourceMasks: [],
    blocks: [
      { id: "copyright", kind: "text", content: "© Tanzania Institute of Education 2023", order: 0 },
      { id: "side-gradient", kind: "image", content: "Illustration for Chapter Five", order: 1, assetId: "decoration" },
      { id: "tomatoes", kind: "image", content: "Three tomatoes arranged above the numeral 3.", accessibleLabel: "Three tomatoes arranged above the numeral 3.", order: 2, assetId: "tomatoes" },
    ],
  }],
} as unknown as Parameters<typeof buildTextCatalog>[0]);
assert.deepEqual(
  usefulVisualsOnly.map((entry) => entry.text),
  ["© Tanzania Institute of Education 2023", "Three tomatoes arranged above the numeral 3."],
  "decorative gradients and generic illustration placeholders must not enter TTS",
);

const repeatedTableCells = buildTextCatalog({
  storyboardPages: [{
    pageNumber: 25,
    status: "ready",
    storyboardedAt: new Date(0).toISOString(),
    title: "Read aloud",
    layout: "activity",
    sourceWidth: 600,
    sourceHeight: 800,
    sourceMasks: [],
    html: "<main></main>",
    blocks: [
      { id: "cell-a", kind: "text", content: "0", order: 0, sourceBounds: { x: 100, y: 300, w: 20, h: 20 } },
      { id: "cell-b", kind: "text", content: "0", order: 1, sourceBounds: { x: 200, y: 300, w: 20, h: 20 } },
      { id: "cell-c", kind: "text", content: "0", order: 2, sourceBounds: { x: 300, y: 300, w: 20, h: 20 } },
    ],
  }],
} as unknown as Parameters<typeof buildTextCatalog>[0]);
assert.equal(repeatedTableCells.length, 3, "every repeated table cell must remain in the reading sequence");

async function run() {
  await assert.rejects(
    () => readProviderResponseJson(new Response("<html>Gateway unavailable</html>", { status: 502, headers: { "content-type": "text/html" } }), "Test provider"),
    /Test provider returned an unreadable 502 response/,
    "provider HTML errors must never leak an Unexpected token JSON exception",
  );
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.signal?.aborted, false);
    const request = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    assert.match(request.contents[0]!.parts[0]!.text, /Source language: sw-TZ/);
    assert.match(request.contents[0]!.parts[0]!.text, /Target language: en/);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ translations: ["Our environment", "We plant trees."] }) }] } }] }), { status: 200 });
  };
  try {
    const batches: number[] = [];
    const translated = await translateCatalog({ entries: source, sourceLanguage: "sw-TZ", targetLanguage: "en", keys, provider: "gemini", signal: new AbortController().signal, onBatch: async entries => { batches.push(entries.length); } });
    assert.deepEqual(translated.map(entry => entry.id), source.map(entry => entry.id), "Stable catalog IDs must survive translation.");
    assert.deepEqual(translated.map(entry => entry.text), ["Our environment", "We plant trees."]);
    assert.deepEqual(batches, [2]);
  } finally { globalThis.fetch = previousFetch; }
}

void run().then(() => console.log("Language engine regression tests passed."));

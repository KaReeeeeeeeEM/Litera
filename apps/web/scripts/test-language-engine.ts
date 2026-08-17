import assert from "node:assert/strict";
import { translateCatalog } from "../src/lib/device-pipeline/language-engine";

const keys = { openai: "", gemini: "test", anthropic: "", azure: "", azureEndpoint: "", azureDeployment: "", custom: "", customEndpoint: "" };
const source = [
  { id: "pg001_tx001", text: "Mazingira yetu", pageNumber: 1 },
  { id: "pg001_tx002", text: "Tunapanda miti.", pageNumber: 1 },
];

async function run() {
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

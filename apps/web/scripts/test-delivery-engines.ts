import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import type { DeviceBook } from "../src/components/device/device-types";
import { packageBook } from "../src/lib/device-pipeline/export-engine";
import {
  isSpeakableText,
  normalizeDottedPageReferences,
  prepareTextForSpeech,
} from "../src/lib/device-pipeline/speech-engine";

async function run() {
  assert.equal(prepareTextForSpeech("  Habari 🌳   dunia! "), "Habari dunia!");
  assert.equal(
    prepareTextForSpeech("Ana vitabu 21 na kilo 3.14.", "sw-TZ"),
    "Ana vitabu ishirini na moja na kilo tatu nukta moja nne.",
  );
  assert.equal(
    prepareTextForSpeech("Mwaka 2025", "sw"),
    "Mwaka elfu mbili na ishirini na tano",
  );
  assert.equal(
    normalizeDottedPageReferences("Utangulizi ............ IV", "sw-TZ"),
    "Utangulizi . nambari ya Kirumi IV",
  );
  assert.equal(
    prepareTextForSpeech("Sura ya kwanza ............ 9", "sw"),
    "Sura ya kwanza . nambari tisa",
  );
  assert.equal(
    normalizeDottedPageReferences("Introduction ............ XII", "en"),
    "Introduction . Roman numeral XII",
  );
  assert.equal(isSpeakableText("..."), false);
  assert.equal(isSpeakableText("Kitabu"), true);
  const book = {
    id: "book",
    name: "Kitabu.pdf",
    size: 1,
    type: "application/pdf",
    addedAt: new Date(0).toISOString(),
    file: new Blob(),
    storyboardPages: [
      {
        pageNumber: 1,
        status: "ready",
        storyboardedAt: new Date(0).toISOString(),
        title: "Mazingira",
        layout: "reading",
        sourceWidth: 600,
        sourceHeight: 800,
        blocks: [
          { id: "pg001_tx001", kind: "heading", content: "Mazingira", order: 1, sourceBounds: { x: 40, y: 160, w: 180, h: 30 } },
          { id: "pg001_figure001", kind: "image", content: "Mti mkubwa", order: 0, assetId: "tree-asset", sourceBounds: { x: 40, y: 60, w: 220, h: 80 } },
        ],
        html: '<!doctype html><html><body><main data-litera-page><h1 data-id="pg001_tx001" style="position:absolute;top:20%;left:7%">Mazingira</h1><figure data-asset-id="tree-asset" style="position:absolute;top:7%;left:7%"><figcaption>Mti mkubwa</figcaption></figure></main></body></html>',
      },
    ],
    languageCatalogs: {
      en: {
        language: "en",
        sourceLanguage: "sw-TZ",
        generatedAt: new Date(0).toISOString(),
        entries: [
          { id: "pg001_tx001", text: "Environment", pageNumber: 1 },
          { id: "pg001_figure001", text: "A large tree", pageNumber: 1 },
        ],
      },
    },
    speechEntries: [
      { id: "en:pg001_tx001", textId: "pg001_tx001", language: "en", pageNumber: 1, inputText: "Environment", voice: "alloy", speed: 1, audio: new Blob(["text"], { type: "audio/mpeg" }), durationMs: 500, words: [{ word: "Environment", startMs: 0, endMs: 500 }] },
      { id: "en:pg001_figure001", textId: "pg001_figure001", language: "en", pageNumber: 1, inputText: "A large tree", voice: "alloy", speed: 1, audio: new Blob(["image"], { type: "audio/mpeg" }), durationMs: 900, words: [{ word: "A", startMs: 0, endMs: 150 }, { word: "large", startMs: 150, endMs: 500 }, { word: "tree", startMs: 500, endMs: 900 }] },
    ],
    validationReport: {
      generatedAt: new Date(0).toISOString(),
      issues: [],
      passed: true,
    },
  } satisfies DeviceBook;
  const artifact = await packageBook(book);
  assert.equal(artifact.mimeType, "application/zip");
  const files = unzipSync(new Uint8Array(await artifact.blob.arrayBuffer()));
  assert.ok(files["index.html"]);
  assert.ok(files["content/pages.json"]);
  assert.ok(files["content/toc.json"]);
  assert.ok(files["assets/config.json"]);
  assert.ok(files["assets/base.bundle.local.js"]);
  assert.ok(files["content/tailwind_output.css"]);
  assert.ok(files["imsmanifest.xml"]);
  assert.deepEqual(
    JSON.parse(strFromU8(files["content/i18n/en/texts.json"]!)),
    { pg001_tx001: "Environment", pg001_figure001: "A large tree" },
  );
  assert.deepEqual(
    Object.keys(JSON.parse(strFromU8(files["content/i18n/en/audios.json"]!))),
    ["pg001_figure001", "pg001_tx001"],
    "exported narration audio must follow visual page order, including figures",
  );
  assert.ok(
    JSON.parse(strFromU8(files["content/i18n/en/timecode/timecode_output.json"]!)).pg001_figure001,
    "exported narration must include word timing data for final-reader highlighting",
  );
  assert.match(
    strFromU8(files["index.html"]!),
    /id="nav-container"/,
    "Litera Web must mount the unchanged ADT reader dock on every page",
  );
  assert.match(
    strFromU8(files["index.html"]!),
    /data-litera-visual-reading-order/,
    "exported pages must normalize DOM order before the reader runtime starts",
  );

  for (const format of [
    "project",
    "scorm",
    "webpub",
    "epub",
    "pnld",
  ] as const) {
    const output = await packageBook(book, format);
    const packageFiles = unzipSync(
      new Uint8Array(await output.blob.arrayBuffer()),
    );
    assert.ok(
      Object.keys(packageFiles).length > 3,
      `${format} must produce a populated package`,
    );
  }
}

void run().then(() => console.log("Delivery engine regression tests passed."));

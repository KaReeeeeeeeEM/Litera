import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import type { DeviceBook } from "../src/components/device/device-types";
import { packageBook } from "../src/lib/device-pipeline/export-engine";
import {
  isSpeakableText,
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
        blocks: [],
        html: '<!doctype html><html><body><main data-litera-page><h1 data-id="pg001_tx001">Mazingira</h1></main></body></html>',
      },
    ],
    languageCatalogs: {
      en: {
        language: "en",
        sourceLanguage: "sw-TZ",
        generatedAt: new Date(0).toISOString(),
        entries: [{ id: "pg001_tx001", text: "Environment", pageNumber: 1 }],
      },
    },
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
    { pg001_tx001: "Environment" },
  );
  assert.match(
    strFromU8(files["index.html"]!),
    /id="nav-container"/,
    "Litera Web must mount the unchanged ADT reader dock on every page",
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

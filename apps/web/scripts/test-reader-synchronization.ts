import assert from "node:assert/strict";
import { alignSpeechToRenderedWords, readerTargetIds, spokenWordAtTime } from "../src/lib/device-pipeline/reader-synchronization";
import { parseAlignedWords, prepareTextForSpeech } from "../src/lib/device-pipeline/speech-engine";

const entry = {
  id: "en:copyright",
  textId: "copyright",
  language: "en",
  pageNumber: 2,
  inputText: "© Tanzania Institute of Education 2023",
  audio: new Blob(),
  durationMs: 3000,
  words: [
    { word: "©", startMs: 0, endMs: 600 },
    { word: "Tanzania", startMs: 600, endMs: 1200 },
    { word: "Institute", startMs: 1200, endMs: 1800 },
    { word: "of", startMs: 1800, endMs: 2200 },
    { word: "Education", startMs: 2200, endMs: 2700 },
    { word: "2023", startMs: 2700, endMs: 3000 },
  ],
};

assert.equal(prepareTextForSpeech("© Tanzania Institute of Education 2023", "en"), "© Tanzania Institute of Education 2023");
assert.equal(spokenWordAtTime(entry, 1.5, 3), 2, "highlighting must use the generated word timeline");
assert.deepEqual(
  alignSpeechToRenderedWords(entry.words.map((word) => word.word), ["©", "Tanzania", "Institute", "of", "Education", "2023"]),
  [0, 1, 2, 3, 4, 5],
  "copyright signs and following words must align with their own rendered tokens",
);
assert.deepEqual(
  readerTargetIds("page-25-figure-2", "page-25-asset-7"),
  ["page-25-figure-2", "page-25-asset-7"],
  "a narrated image must resolve both its semantic block ID and rendered asset ID",
);

for (const sample of [
  { at: 0.1, expected: 0 },
  { at: 0.7, expected: 1 },
  { at: 1.45, expected: 2 },
  { at: 2.95, expected: 5 },
]) {
  assert.equal(spokenWordAtTime(entry, sample.at, 3), sample.expected, `word timeline mismatch at ${sample.at}s`);
}
assert.deepEqual(
  parseAlignedWords([
    { word: "©", start: 0, end: 0.41 },
    { word: "Tanzania", start: 0.41, end: 0.93 },
  ]),
  [
    { word: "©", startMs: 0, endMs: 410 },
    { word: "Tanzania", startMs: 410, endMs: 930 },
  ],
  "provider alignment must be preserved as millisecond word timestamps",
);
assert.deepEqual(
  alignSpeechToRenderedWords(["copyright", "Tanzania"], ["©", "Tanzania"]),
  [0, 1],
  "a provider pronunciation of the copyright sign must still highlight the symbol",
);

console.log("Reader synchronization regression tests passed.");

import assert from "node:assert/strict";
import {
  createStoryboardPage,
  renderStoryboardHtml,
} from "../src/lib/device-pipeline/storyboard-engine";
import { structurePageText } from "../src/lib/device-pipeline/structure-engine";
import {
  hydrateStoryboardAssets,
  renderPageWithAi,
  sanitizeStoryboardHtml,
  storyboardImagesAreReferenced,
  storyboardPaletteIsSafe,
} from "../src/lib/device-pipeline/ai-storyboard-engine";
import { createGeometryStoryboardHtml } from "../src/lib/device-pipeline/geometry-storyboard-engine";
import { uniqueStoryboardSources } from "../src/lib/device-pipeline/storyboard-run-policy";
import {
  inferCorrectAnswers,
  renderMathInText,
} from "../src/lib/device-pipeline/math-content-engine";

assert.deepEqual(
  inferCorrectAnswers(
    "Yohana aliuza mayai kwa shilingi 8,600 na kuku kwa shilingi 17,500. Je, alipata jumla ya shilingi ngapi?",
  ),
  ["26100"],
);
assert.deepEqual(
  inferCorrectAnswers(
    "Bupe alinunua mchele kwa shilingi 438,000. Baada ya kuuza alipata faida ya shilingi 96,000. Je, aliuza mchele kwa shilingi ngapi?",
  ),
  ["534000"],
);
assert.deepEqual(
  inferCorrectAnswers(
    "Jeni alipata hasara ya shilingi 2,500 baada ya kuuza bidhaa kwa shilingi 87,500. Je, bidhaa hiyo ilikuwa imenunuliwa kwa kiasi gani?",
  ),
  ["90000"],
);
assert.deepEqual(
  inferCorrectAnswers("Mbuzi wawili ni sehemu gani ya mbuzi sita?"),
  ["1/3"],
);
assert.deepEqual(
  inferCorrectAnswers("9. Kuna maembe manane, kati ya hayo mawili ni mabovu. Maembe mabovu ni sehemu gani ya maembe yote?"),
  ["1/4"],
);
assert.deepEqual(
  inferCorrectAnswers("Sadiki ana ndizi ishirini. Anataka kuwapa ndizi watoto wake wanne kwa usawa. Je, kila mtoto atapata sehemu gani ya ndizi zote?"),
  ["1/4"],
);
assert.deepEqual(
  inferCorrectAnswers("Selemani alikuwa na papai moja. Aliamua agawane papai hilo na rafiki zake wawili katika vipande vilivyo sawa. Je, kila moja alipata sehemu gani ya papai hilo?"),
  ["1/3"],
);

const continuationQuestionBlocks = [
  ["7.", 420, "Musa aligawanya mche wa sabuni katika sehemu nne zilizo sawa. Je, alimpa sehemu gani?"],
  ["8.", 485, "Mbuzi wawili ni sehemu gani ya mbuzi sita?"],
  ["9.", 535, "Kuna maembe manane, kati ya hayo mawili ni mabovu. Je, ni sehemu gani?"],
  ["10.", 590, "Mkulima amechuma mapapai sita na kuwagawia watoto watatu. Je, kila mtoto atapata sehemu gani?"],
  ["11.", 660, "Selemani ana papai moja na rafiki wawili. Je, kila mmoja alipata sehemu gani?"],
  ["12.", 730, "Sadiki ana ndizi ishirini na watoto wanne. Je, kila mtoto atapata sehemu gani?"],
].flatMap(([label, y, prompt]) => [
  { type: "text" as const, text: String(label), bbox: { x: 55, y: Number(y), w: 24, h: 15 }, font: { size: 11 } },
  { type: "text" as const, text: String(prompt), bbox: { x: 90, y: Number(y), w: 420, h: 32 }, font: { size: 11 } },
]);
const page120ContinuationStructure = structurePageText(120, "", continuationQuestionBlocks);
assert.equal(page120ContinuationStructure.activities.length, 6, "continuation-page word problems must remain six distinct activities without a repeated heading");
assert.ok(page120ContinuationStructure.activities.every((activity) => activity.sourceBounds), "detected activities must retain their source region for Structure review");

const continuationHtml = createGeometryStoryboardHtml(
  { number: 120, width: 569, height: 779, layoutBlocks: continuationQuestionBlocks, assets: [{ id: "page-panel", kind: "image", blob: new Blob(), bounds: { x: 45, y: 80, w: 480, h: 670 } }] },
  {},
);
assert.equal((continuationHtml.match(/<div class="dense-question">/g) ?? []).length, 6, "page-scale panels must not suppress answer slots for numbered prose questions");

assert.match(
  renderMathInText("3/4 + 1/4 = ?"),
  /data-latex="\\frac\{3\}\{4\} \+ \\frac\{1\}\{4\} = \\square"/,
  "printed fractions must render as accessible stacked LaTeX fractions",
);
assert.match(
  renderMathInText("Andika sehemu 2/6 ya maembe yote."),
  /data-latex="\\frac\{2\}\{6\}"/,
  "standalone fractions in prose must use the same stacked MathML rendering",
);
assert.equal(
  renderMathInText("ISBN: 978-9987-09-996-2"),
  "ISBN: 978-9987-09-996-2",
  "hyphenated publication identifiers must remain plain text",
);
assert.deepEqual(
  structurePageText(2, "ISBN: 978-9987-09-996-2").activities,
  [],
  "publication identifiers must never create answer inputs",
);
assert.deepEqual(
  structurePageText(
    7,
    "Utangulizi\nUmuhimu utakaoujenga utakuwezesha kutumia namba nzima katika shughuli mbalimbali zinazohusiana na maisha ya kila siku.",
  ).activities,
  [],
  "ordinary prose beginning with shughuli must not be classified as an activity heading",
);

const structured = structurePageText(
  4,
  `Mazingira

Soma kifungu hiki.

Swali: Kwa nini tunapanda miti?`,
);
const storyboard = createStoryboardPage(
  structured,
  { width: 595, height: 842 },
  "Atkinson Hyperlegible",
);

assert.equal(storyboard.pageNumber, 4);
assert.equal(storyboard.status, "ready");
assert.equal(storyboard.layout, "activity");
assert.equal(storyboard.blocks[0]?.kind, "heading");
assert.equal(storyboard.blocks.at(-1)?.kind, "activity");
assert.match(storyboard.blocks.at(-1)?.accessibleLabel ?? "", /labelled/i);
assert.match(storyboard.html, /<!doctype html>/i);
assert.match(storyboard.html, /class="panel activity"/);
assert.match(storyboard.html, /<main aria-label=/);
assert.match(storyboard.html, /aria-label="Accessible book page 4"/);
assert.doesNotMatch(storyboard.html, /cdn\.tailwindcss/);
assert.ok((storyboard.sourceAspectRatio ?? 0) > 0.7);

const fixed = createStoryboardPage(structured, {
  width: 540,
  height: 750,
  layoutBlocks: [
    {
      type: "text",
      bbox: { x: 60, y: 80, w: 300, h: 60 },
      text: "Mazingira",
      font: { size: 32, weight: "bold" },
    },
    {
      type: "text",
      bbox: { x: 60, y: 180, w: 300, h: 30 },
      text: "Fikiri",
      font: { size: 18, weight: "bold" },
    },
    { type: "image", bbox: { x: 70, y: 210, w: 90, h: 90 } },
    {
      type: "text",
      bbox: { x: 30, y: 735, w: 480, h: 10 },
      text: "BOOK.indd 1 29/06/2025 15:18:36",
      font: { size: 6 },
    },
  ],
  assets: [
    {
      id: "page-4-image-0",
      kind: "image",
      blob: new Blob(),
      bounds: { x: 70, y: 210, w: 90, h: 90 },
    },
  ],
});
const fixedHtml = renderStoryboardHtml(fixed, {
  imageUrls: { "page-4-image-0": "blob:litera-figure" },
});
assert.match(fixedHtml, /class="panel sidebar"/);
assert.match(fixedHtml, /src="blob:litera-figure"/);
assert.doesNotMatch(fixedHtml, /source-layer/);
assert.doesNotMatch(fixedHtml, /BOOK\.indd/);

const escaped = {
  ...storyboard,
  blocks: [{ ...storyboard.blocks[0]!, content: "<script>alert(1)</script>" }],
};
assert.doesNotMatch(renderStoryboardHtml(escaped), /<script>/);
assert.match(renderStoryboardHtml(escaped), /&lt;script&gt;/);

const reading = createStoryboardPage(
  structurePageText(2, "Utangulizi\n\nHii ni aya ya kusoma."),
);
assert.equal(reading.layout, "reading");
assert.deepEqual(
  reading.blocks.map(({ order }) => order),
  [0, 1],
);

assert.deepEqual(
  uniqueStoryboardSources([
    structured,
    { ...structured, title: "Duplicate persisted page" },
  ]).map((page) => page.pageNumber),
  [4],
  "a fresh run must render each source page exactly once",
);

const denseBlocks = Array.from({ length: 24 }, (_, index) => ({
  type: "text" as const,
  bbox: { x: 40, y: 30 + index * 24, w: 420, h: 18 },
  text: `Measured line ${index + 1}`,
  font: { size: 10 },
}));
const denseHtml = createGeometryStoryboardHtml(
  { number: 7, width: 500, height: 700, layoutBlocks: denseBlocks },
  {},
);
assert.match(
  denseHtml,
  /class="source-folio source-folio--digital"[^>]*>7<\/span>/,
  "pages without a printed folio must still receive a visible digital page number",
);

const tocLeaderHtml = createGeometryStoryboardHtml(
  {
    number: 3,
    width: 500,
    height: 700,
    layoutBlocks: [
      { type: "text", bbox: { x: 55, y: 55, w: 390, h: 36 }, text: "Yaliyomo", font: { size: 26, weight: "bold", color: "#176b3a" } },
      { type: "text", bbox: { x: 60, y: 130, w: 380, h: 20 }, text: "Sura ya Kwanza ............ 9", font: { size: 12 } },
      { type: "text", bbox: { x: 60, y: 165, w: 380, h: 20 }, text: "Sura ya Pili .............. 18", font: { size: 12 } },
    ],
  },
  {},
  {
    digitalPageNumber: 3,
    tocTitle: "Yaliyomo",
    tocEntries: [{ title: "Sura ya Kwanza ............ 9", pageNumber: 11, level: 1 }],
  },
);
assert.match(tocLeaderHtml, />Sura ya Kwanza<\/span>/, "printed dot leaders and obsolete source folios must not become part of a TOC title");
assert.doesNotMatch(tocLeaderHtml, /Sura ya Kwanza \.{2,}/);
assert.equal(
  (denseHtml.match(/data-layout-block=/g) ?? []).length,
  denseBlocks.length,
  "dense pages must retain every measured source line",
);
assert.doesNotMatch(
  denseHtml,
  /class="reading-flow"/,
  "dense pages must not be collapsed into a generic reading column",
);

const syllableWordHtml = createGeometryStoryboardHtml(
  {
    number: 11,
    width: 600,
    height: 800,
    layoutBlocks: [
      { type: "text", bbox: { x: 80, y: 180, w: 28, h: 18 }, text: "tel-", font: { size: 12 } },
      { type: "text", bbox: { x: 110, y: 182, w: 18, h: 16 }, text: "e-", font: { size: 9 } },
      { type: "text", bbox: { x: 130, y: 180, w: 24, h: 18 }, text: "vi-", font: { size: 12 } },
      { type: "text", bbox: { x: 156, y: 180, w: 32, h: 18 }, text: "sio-", font: { size: 12 } },
      { type: "text", bbox: { x: 190, y: 180, w: 14, h: 18 }, text: "n", font: { size: 12 } },
    ],
  },
  {},
);
const syllableSizes = [
  ...syllableWordHtml.matchAll(
    /data-layout-block="\d+"[^>]*font-size:([0-9.]+)cqw/g,
  ),
].map((match) => match[1]);
assert.equal(new Set(syllableSizes).size, 1, "adjacent syllables in one teaching word must use one coherent font size");

const lightCoverTitleHtml = createGeometryStoryboardHtml(
  {
    number: 1,
    width: 569,
    height: 779,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 150, y: 70, w: 280, h: 82 },
        text: "Hisabati",
        font: { size: 72, weight: "bold", color: "#ffffff" },
      },
      { type: "image", bbox: { x: 150, y: 70, w: 280, h: 82 } },
    ],
  },
  {},
  { decoration: { top: "#ffffff", bottom: "#ffffff", accent: "#00a9df" } },
);
assert.match(
  lightCoverTitleHtml,
  /font-size:[^;]+;font-weight:700[^>]+color:(?!#ffffff)[^;"']+/i,
  "a light-coloured cover title must not disappear merely because a same-size PDF paint fragment overlaps it",
);

const wrappedInstructionHtml = createGeometryStoryboardHtml(
  {
    number: 13,
    width: 600,
    height: 800,
    layoutBlocks: [
      { type: "text", bbox: { x: 75, y: 70, w: 35, h: 20 }, text: "(b)", font: { size: 16 } },
      { type: "text", bbox: { x: 115, y: 70, w: 230, h: 20 }, text: "Practise reading aloud the following multi", font: { size: 16 } },
      { type: "text", bbox: { x: 450, y: 70, w: 70, h: 20 }, text: "syllable", font: { size: 16 } },
      { type: "text", bbox: { x: 115, y: 94, w: 58, h: 20 }, text: "words.", font: { size: 16 } },
    ],
  },
  {},
);
const instructionSizes = [
  ...wrappedInstructionHtml.matchAll(
    /data-layout-block="\d+"[^>]*font-size:([0-9.]+)cqw/g,
  ),
].map((match) => match[1]);
assert.equal(
  new Set(instructionSizes).size,
  1,
  "wrapped source instructions must preserve one vertical text size across every line",
);
assert.match(
  wrappedInstructionHtml,
  /transform:scaleX\(/,
  "font metric compensation should adjust line width without shrinking its hierarchy",
);

const narrowNumberHtml = createGeometryStoryboardHtml(
  {
    number: 12,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 470, y: 300, w: 42, h: 18 },
        text: "398,800",
        font: { size: 14 },
      },
    ],
  },
  {},
);
assert.match(narrowNumberHtml, /data-numeric-layout="true"/);
assert.match(
  narrowNumberHtml,
  /data-numeric-layout="true"[^>]*overflow:hidden/,
  "long numbers must be fitted and clipped to their measured source box instead of overflowing adjacent columns",
);

const equationGridHtml = createGeometryStoryboardHtml(
  {
    number: 122,
    width: 569,
    height: 779,
    layoutBlocks: [
      { type: "text", bbox: { x: 70, y: 350, w: 260, h: 24 }, text: "Zoezi la 2", font: { size: 18, weight: "bold" } },
      { type: "text", bbox: { x: 105, y: 430, w: 92, h: 24 }, text: "2/5 + 2/5 =", font: { size: 16 } },
      { type: "text", bbox: { x: 330, y: 430, w: 92, h: 24 }, text: "3/9 + 5/9 =", font: { size: 16 } },
      { type: "text", bbox: { x: 105, y: 500, w: 92, h: 24 }, text: "1/4 + 1/4 =", font: { size: 16 } },
    ],
  },
  {},
);
assert.equal(
  (equationGridHtml.match(/data-placement-evidence="equation-equals-anchor"/g) ?? []).length,
  3,
  "every unanswered activity equation must get exactly one slot after its printed equals sign",
);
assert.doesNotMatch(
  equationGridHtml,
  /data-placement-evidence="semantically-aligned-whitespace"/,
  "equation grids must not gain speculative whitespace inputs",
);

const continuationEquationHtml = createGeometryStoryboardHtml(
  {
    number: 123,
    width: 569,
    height: 779,
    layoutBlocks: [
      { type: "text", bbox: { x: 70, y: 100, w: 18, h: 20 }, text: "(k)", font: { size: 13 } },
      { type: "text", bbox: { x: 105, y: 100, w: 92, h: 24 }, text: "1/4 + 2/4 =", font: { size: 16 } },
      { type: "text", bbox: { x: 300, y: 100, w: 18, h: 20 }, text: "(l)", font: { size: 13 } },
      { type: "text", bbox: { x: 335, y: 100, w: 92, h: 24 }, text: "1/15 + 6/15 =", font: { size: 16 } },
      { type: "text", bbox: { x: 70, y: 170, w: 18, h: 20 }, text: "(m)", font: { size: 13 } },
      { type: "text", bbox: { x: 105, y: 170, w: 92, h: 24 }, text: "3/9 + 4/9 =", font: { size: 16 } },
    ],
  },
  {},
);
assert.equal(
  (continuationEquationHtml.match(/data-placement-evidence="equation-equals-anchor"/g) ?? []).length,
  3,
  "an exercise continued onto a new page must retain its answer slots without a repeated heading",
);

const continuationStructure = structurePageText(123, "", [
  { type: "text", bbox: { x: 70, y: 100, w: 18, h: 20 }, text: "(k)" },
  { type: "text", bbox: { x: 105, y: 100, w: 70, h: 24 }, text: "1/4 + 2/4" },
  { type: "text", bbox: { x: 180, y: 100, w: 10, h: 24 }, text: "=" },
  { type: "text", bbox: { x: 300, y: 100, w: 18, h: 20 }, text: "(l)" },
  { type: "text", bbox: { x: 335, y: 100, w: 70, h: 24 }, text: "1/15 + 6/15" },
  { type: "text", bbox: { x: 410, y: 100, w: 10, h: 24 }, text: "=" },
  { type: "text", bbox: { x: 70, y: 170, w: 18, h: 20 }, text: "(m)" },
  { type: "text", bbox: { x: 105, y: 170, w: 70, h: 24 }, text: "3/9 + 4/9" },
  { type: "text", bbox: { x: 180, y: 170, w: 10, h: 24 }, text: "=" },
]);
assert.equal(
  continuationStructure.activities.length,
  3,
  "Structure must classify every labelled row on a continuation page as an activity",
);

const labelledQuestionGridHtml = createGeometryStoryboardHtml(
  {
    number: 11,
    width: 569,
    height: 779,
    layoutBlocks: [
      { type: "text", bbox: { x: 70, y: 80, w: 12, h: 18 }, text: "6." },
      { type: "text", bbox: { x: 90, y: 80, w: 330, h: 18 }, text: "Bainisha thamani ya nafasi ya kila tarakimu" },
      ...["(a)", "(b)", "(c)"].flatMap((label, index) => [
        { type: "text" as const, bbox: { x: 90 + index * 150, y: 125, w: 20, h: 18 }, text: label },
        { type: "text" as const, bbox: { x: 116 + index * 150, y: 125, w: 42, h: 18 }, text: String(6247 + index) },
      ]),
      { type: "text", bbox: { x: 70, y: 220, w: 12, h: 18 }, text: "7." },
      { type: "text", bbox: { x: 90, y: 220, w: 330, h: 18 }, text: "Andika thamani ya nafasi ya tarakimu" },
      ...["(a)", "(b)", "(c)"].flatMap((label, index) => [
        { type: "text" as const, bbox: { x: 90 + index * 150, y: 265, w: 20, h: 18 }, text: label },
        { type: "text" as const, bbox: { x: 116 + index * 150, y: 265, w: 42, h: 18 }, text: String(1020 + index) },
      ]),
    ],
  },
  {},
);
assert.equal(
  (labelledQuestionGridHtml.match(/data-placement-evidence="labelled-question-item"/g) ?? []).length,
  6,
  "labelled question grids without printed rules need one response slot per item",
);

const workedExampleRulesHtml = createGeometryStoryboardHtml(
  {
    number: 35,
    width: 569,
    height: 779,
    layoutBlocks: [
      { type: "text", bbox: { x: 80, y: 70, w: 120, h: 24 }, text: "Mfano wa 4", font: { size: 18, weight: "bold" } },
      { type: "text", bbox: { x: 80, y: 110, w: 320, h: 18 }, text: "Andika namba zifuatazo kwa kirefu:" },
      { type: "image", bbox: { x: 90, y: 160, w: 130, h: 2 } },
      { type: "image", bbox: { x: 250, y: 160, w: 130, h: 2 } },
    ],
  },
  {},
);
assert.doesNotMatch(
  workedExampleRulesHtml,
  /data-placement-evidence="printed-writing-rule"/,
  "thin rules inside worked examples must remain printed content, not answer inputs",
);

const stackedActivityHtml = createGeometryStoryboardHtml(
  {
    number: 65,
    width: 569,
    height: 779,
    layoutBlocks: [
      { type: "text", bbox: { x: 70, y: 300, w: 130, h: 22 }, text: "Zoezi la 4", font: { size: 18, weight: "bold" } },
      { type: "text", bbox: { x: 90, y: 370, w: 45, h: 18 }, text: "6027" },
      { type: "text", bbox: { x: 84, y: 392, w: 51, h: 18 }, text: "+ 1784" },
      { type: "image", bbox: { x: 82, y: 414, w: 72, h: 2 } },
    ],
  },
  {},
);
assert.match(
  stackedActivityHtml,
  /data-placement-evidence="printed-writing-rule"/,
  "a printed result rule below separately extracted stacked operands must become an answer input",
);

const repeatedPictureAnswers = createGeometryStoryboardHtml(
  {
    number: 9,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 40, y: 40, w: 300, h: 24 },
        text: "Activity 3: Describe the actions",
        font: { size: 16 },
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        type: "text" as const,
        bbox: {
          x: 40 + (index % 3) * 180,
          y: 260 + Math.floor(index / 3) * 260,
          w: 120,
          h: 20,
        },
        text: index === 2 || index === 5 ? "They are ..." : "He is ...",
        font: { size: 10 },
      })),
    ],
  },
  {},
);
assert.equal(
  (repeatedPictureAnswers.match(/class="source-answer-line"/g) ?? []).length,
  6,
  "identical response stems in separate picture questions must each keep an answer slot",
);

const workedExampleHtml = createGeometryStoryboardHtml(
  {
    number: 8,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 100, y: 90, w: 150, h: 24 },
        text: "Mfano wa 4",
        font: { size: 16 },
      },
      {
        type: "text",
        bbox: { x: 80, y: 140, w: 430, h: 20 },
        text: "Jaza nafasi zilizoachwa wazi:",
        font: { size: 11 },
      },
      {
        type: "text",
        bbox: { x: 80, y: 180, w: 430, h: 20 },
        text: "5463 ina maelfu___, mamia___, makumi___ na mamoja___.",
        font: { size: 11 },
      },
      {
        type: "text",
        bbox: { x: 80, y: 230, w: 70, h: 20 },
        text: "Jibu",
        font: { size: 11 },
      },
    ],
  },
  {},
);
assert.equal(
  (workedExampleHtml.match(/class="source-answer-line"/g) ?? []).length,
  0,
  "printed blanks inside a worked example must not become learner inputs",
);
assert.match(
  workedExampleHtml,
  /class="example-panel"/,
  "worked examples must retain their visible panel grouping",
);

const unicodeAnswerRules = createGeometryStoryboardHtml(
  {
    number: 12,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 40, y: 50, w: 420, h: 22 },
        text: "Activity 2: Complete the responses.",
        font: { size: 15 },
      },
      ...["‐‐‐‐‐", "‑‑‑‑‑", "‒‒‒‒‒", "–––––"].map((text, index) => ({
        type: "text" as const,
        bbox: { x: 390, y: 150 + index * 90, w: 130, h: 20 },
        text,
        font: { size: 11 },
      })),
    ],
  },
  {},
);
assert.equal(
  (unicodeAnswerRules.match(/class="source-answer-line"/g) ?? []).length,
  4,
  "all Unicode dash variants used as printed response rules need inputs",
);

const mixedWrittenAndOral = createGeometryStoryboardHtml(
  {
    number: 13,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 40, y: 50, w: 360, h: 22 },
        text: "Activity: Complete the riddles.",
        font: { size: 15 },
      },
      {
        type: "text",
        bbox: { x: 390, y: 150, w: 130, h: 20 },
        text: "----------------",
        font: { size: 11 },
      },
      {
        type: "text",
        bbox: { x: 40, y: 300, w: 470, h: 22 },
        text: "Read the story and answer the",
        font: { size: 13 },
      },
      {
        type: "text",
        bbox: { x: 40, y: 325, w: 470, h: 22 },
        text: "questions that follow orally.",
        font: { size: 13 },
      },
      {
        type: "text",
        bbox: { x: 390, y: 520, w: 130, h: 20 },
        text: "----------------",
        font: { size: 11 },
      },
    ],
  },
  {},
);
assert.equal(
  (mixedWrittenAndOral.match(/class="source-answer-line"/g) ?? []).length,
  1,
  "oral subsections must not erase earlier written inputs or gain their own",
);

const stackedFractionExercise = createGeometryStoryboardHtml(
  {
    number: 116,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 45, y: 50, w: 300, h: 22 },
        text: "Zoezi la 2",
        font: { size: 16 },
      },
      { type: "text", bbox: { x: 150, y: 180, w: 14, h: 18 }, text: "2" },
      { type: "text", bbox: { x: 190, y: 180, w: 14, h: 18 }, text: "2" },
      { type: "text", bbox: { x: 170, y: 195, w: 14, h: 18 }, text: "+" },
      { type: "text", bbox: { x: 215, y: 195, w: 14, h: 18 }, text: "=" },
      { type: "text", bbox: { x: 150, y: 214, w: 14, h: 18 }, text: "5" },
      { type: "text", bbox: { x: 190, y: 214, w: 14, h: 18 }, text: "5" },
    ],
  },
  {},
);
assert.match(
  stackedFractionExercise,
  /data-correct-answer="4\/5"/,
  "stacked same-denominator fractions must provide checkable answers",
);
assert.match(
  stackedFractionExercise,
  /data-latex="\\frac\{2\}\{5\} \+ \\frac\{2\}\{5\} ="/,
  "stacked fraction questions must render from a LaTeX expression",
);
assert.equal(
  (stackedFractionExercise.match(/<mfrac>/g) ?? []).length,
  2,
  "one fraction question must be composed as one MathML equation",
);
assert.match(stackedFractionExercise, /data-placement-confidence="0\.98"/);
assert.match(stackedFractionExercise, /data-normalized-rect="[^"]+"/);

const rightColumnMath = createGeometryStoryboardHtml(
  {
    number: 118,
    width: 600,
    height: 800,
    layoutBlocks: [
      { type: "text", bbox: { x: 45, y: 50, w: 470, h: 22 }, text: "Zoezi la 4" },
      { type: "text", bbox: { x: 500, y: 180, w: 12, h: 18 }, text: "3" },
      { type: "text", bbox: { x: 525, y: 180, w: 12, h: 18 }, text: "5" },
      { type: "text", bbox: { x: 515, y: 195, w: 12, h: 18 }, text: "+" },
      { type: "text", bbox: { x: 548, y: 195, w: 12, h: 18 }, text: "=" },
      { type: "text", bbox: { x: 500, y: 214, w: 12, h: 18 }, text: "9" },
      { type: "text", bbox: { x: 525, y: 214, w: 12, h: 18 }, text: "9" },
    ],
  },
  {},
);
const panelStyle = rightColumnMath.match(
  /class="activity-panel"[^>]*style="left:([\d.]+)%;[^>]*width:([\d.]+)%/,
);
const answerStyle = rightColumnMath.match(
  /class="source-answer-line"[^>]*style="left:([\d.]+)%;[^>]*width:([\d.]+)%/,
);
assert.ok(panelStyle && answerStyle, "right-column mathematics should retain its panel and answer control");
assert.ok(
  Number(answerStyle[1]) + Number(answerStyle[2]) <=
    Number(panelStyle[1]) + Number(panelStyle[2]) + 0.01,
  "mathematics answer controls must stay inside their owning exercise panel",
);

const collidingFractionAnswer = createGeometryStoryboardHtml(
  {
    number: 117,
    width: 600,
    height: 800,
    layoutBlocks: [
      { type: "text", bbox: { x: 45, y: 50, w: 300, h: 22 }, text: "Zoezi la 3" },
      { type: "text", bbox: { x: 150, y: 180, w: 14, h: 18 }, text: "1" },
      { type: "text", bbox: { x: 190, y: 180, w: 14, h: 18 }, text: "1" },
      { type: "text", bbox: { x: 170, y: 195, w: 14, h: 18 }, text: "+" },
      { type: "text", bbox: { x: 215, y: 195, w: 14, h: 18 }, text: "=" },
      { type: "text", bbox: { x: 150, y: 214, w: 14, h: 18 }, text: "2" },
      { type: "text", bbox: { x: 190, y: 214, w: 14, h: 18 }, text: "2" },
      {
        type: "text",
        bbox: { x: 232, y: 194, w: 80, h: 22 },
        text: "printed note",
      },
    ],
  },
  {},
);
assert.equal(
  (collidingFractionAnswer.match(/class="source-answer-line"/g) ?? []).length,
  0,
  "a candidate that covers meaningful ink must abstain",
);

const exactIllustrations = createGeometryStoryboardHtml(
  {
    number: 9,
    width: 600,
    height: 800,
    assets: [
      {
        id: "person-1",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 60, y: 180, w: 100, h: 120 },
      },
      {
        id: "person-1-fragment",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 62, y: 182, w: 96, h: 116 },
      },
      {
        id: "person-2",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 240, y: 180, w: 100, h: 120 },
      },
      {
        id: "person-3",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 420, y: 180, w: 100, h: 120 },
      },
      {
        id: "person-4",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 60, y: 440, w: 100, h: 120 },
      },
    ],
  },
  {
    "person-1": "blob:person-1",
    "person-1-fragment": "blob:person-1-fragment",
    "person-2": "blob:person-2",
    "person-3": "blob:person-3",
    "person-4": "blob:person-4",
  },
);
assert.equal(
  (exactIllustrations.match(/<figure/g) ?? []).length,
  4,
  "overlapping extraction fragments must not duplicate one printed visual",
);
assert.match(
  exactIllustrations,
  /left:10\.000%;top:22\.500%;width:16\.667%;height:15\.000%/,
);

const composedDiagram = createGeometryStoryboardHtml(
  {
    number: 65,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 90, y: 120, w: 220, h: 18 },
        text: "Mamia elfu",
      },
      {
        type: "text",
        bbox: { x: 80, y: 420, w: 120, h: 20 },
        text: "Zoezi la 4",
      },
    ],
    assets: [
      {
        id: "page-65-composite-example-continuation-1",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 70, y: 70, w: 460, h: 310 },
        containsText: true,
      },
    ],
  },
  {
    "page-65-composite-example-continuation-1": "blob:diagram",
  },
);
assert.match(
  composedDiagram,
  /<img src="blob:diagram"/,
  "a bounded text-bearing teaching diagram must remain visible",
);
assert.match(
  composedDiagram,
  /class="composite-example-semantics"/,
  "duplicate diagram labels must remain available without visible redrawing",
);

const shadingDiagram = createGeometryStoryboardHtml(
  {
    number: 119,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 70, y: 80, w: 300, h: 20 },
        text: "Tia kivuli katika mchoro (a) hadi (e)",
      },
    ],
    assets: [
      {
        id: "page-119-composite-activity-diagram-1",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 70, y: 110, w: 460, h: 420 },
        containsText: true,
      },
    ],
  },
  { "page-119-composite-activity-diagram-1": "blob:shading" },
);
assert.match(shadingDiagram, /data-litera-shading/);
assert.match(shadingDiagram, /Printed shapes for an interactive shading activity/);
assert.doesNotMatch(shadingDiagram, /semantically-aligned-whitespace/);

const fractionWordProblems = createGeometryStoryboardHtml(
  {
    number: 120,
    width: 600,
    height: 800,
    layoutBlocks: [
      { type: "text", bbox: { x: 72, y: 38, w: 420, h: 18 }, text: "Taja sehemu iliyotiwa kivuli." },
      { type: "text", bbox: { x: 72, y: 68, w: 24, h: 18 }, text: "(a)" },
      { type: "text", bbox: { x: 72, y: 150, w: 24, h: 18 }, text: "(b)" },
      ...Array.from({ length: 6 }, (_, index) => ({
        type: "text" as const,
        bbox: { x: 70, y: 250 + index * 74, w: 22, h: 18 },
        text: `${index + 7}.`,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        type: "text" as const,
        bbox: { x: 110, y: 250 + index * 74, w: 400, h: 34 },
        text: `Swali la sehemu namba ${index + 7}?`,
      })),
    ],
    assets: [
      { id: "fraction-a", kind: "image", blob: new Blob(), bounds: { x: 120, y: 62, w: 330, h: 48 } },
      { id: "fraction-b", kind: "image", blob: new Blob(), bounds: { x: 120, y: 142, w: 330, h: 48 } },
    ],
  },
  { "fraction-a": "blob:a", "fraction-b": "blob:b" },
);
assert.equal(
  (fractionWordProblems.match(/<div class="dense-question">/g) ?? []).length,
  6,
  "each numbered word problem must receive one direct answer line below it",
);
assert.equal(
  (fractionWordProblems.match(/data-placement-evidence="labelled-fraction-diagram"/g) ?? []).length,
  2,
  "each labelled fraction diagram must receive one answer line below it",
);
assert.match(
  fractionWordProblems,
  /data-litera-submit[^>]*disabled>Wasilisha majibu<\/button>/,
  "answer pages must use a localized submit button instead of grading on every keystroke",
);

const cleanCoverTitle = createGeometryStoryboardHtml(
  {
    number: 1,
    width: 600,
    height: 800,
    layoutBlocks: [
      { type: "text", bbox: { x: 160, y: 120, w: 280, h: 54 }, text: "Hisabati", font: { size: 46, weight: "bold" } },
      { type: "image", bbox: { x: 150, y: 148, w: 300, h: 2 } },
    ],
  },
  {},
);
assert.doesNotMatch(
  cleanCoverTitle,
  /class="source-rule"/,
  "cover crop and registration fragments must not draw lines behind the title",
);

const numberedPictureActivity = createGeometryStoryboardHtml(
  {
    number: 3,
    width: 600,
    height: 800,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 40, y: 40, w: 360, h: 24 },
        text: "Look at the objects and name them.",
        font: { size: 16 },
      },
      {
        type: "text",
        bbox: { x: 48, y: 118, w: 16, h: 16 },
        text: "1",
        font: { size: 10 },
      },
      {
        type: "text",
        bbox: { x: 228, y: 118, w: 16, h: 16 },
        text: "2",
        font: { size: 10 },
      },
      {
        type: "text",
        bbox: { x: 408, y: 118, w: 16, h: 16 },
        text: "3",
        font: { size: 10 },
      },
      { type: "image", bbox: { x: 40, y: 110, w: 140, h: 150 } },
      { type: "image", bbox: { x: 220, y: 110, w: 140, h: 150 } },
      { type: "image", bbox: { x: 400, y: 110, w: 140, h: 150 } },
    ],
    assets: [
      {
        id: "object-1",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 40, y: 110, w: 140, h: 150 },
      },
      {
        id: "object-2",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 220, y: 110, w: 140, h: 150 },
      },
      {
        id: "object-3",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 400, y: 110, w: 140, h: 150 },
      },
    ],
  },
  { "object-1": "blob:1", "object-2": "blob:2", "object-3": "blob:3" },
);
assert.equal(
  (numberedPictureActivity.match(/class="source-answer-line"/g) ?? []).length,
  3,
  "numbered picture questions without printed dashes need one spatially paired response each",
);
const numberedAnswerLefts = [
  ...numberedPictureActivity.matchAll(
    /class="source-answer-line"[^>]*style="left:([\d.]+)%/g,
  ),
].map((match) => Number(match[1]));
assert.deepEqual(
  numberedAnswerLefts,
  [...numberedAnswerLefts].sort((a, b) => a - b),
  "picture-question responses must follow source row order",
);

const publicationHtml = createGeometryStoryboardHtml(
  {
    number: 12,
    width: 500,
    height: 700,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 40, y: 80, w: 300, h: 20 },
        text: "Accessible chapter",
        font: { size: 14, color: "#136b39" },
      },
      {
        type: "text",
        bbox: { x: 160, y: 350, w: 220, h: 20 },
        text: "FOR ONLINE USE ONLY",
        font: { size: 12 },
      },
      {
        type: "text",
        bbox: { x: 245, y: 665, w: 10, h: 12 },
        text: "87",
        font: { size: 8 },
      },
    ],
  },
  {},
  {
    digitalPageNumber: 5,
    decoration: {
      top: "#e7f0e9",
      bottom: "#dfeae2",
      accent: "#136b39",
      gradientStops: ["#e7f0e9", "#f8fbf8", "#dfeae2"],
      gradientAngle: 180,
    },
  },
);
assert.match(publicationHtml, /Digital page 5/);
assert.doesNotMatch(publicationHtml, /ONLINE USE ONLY|>87</);
assert.match(
  publicationHtml,
  /background:linear-gradient\(180deg,#e7f0e9 0\.0%,#f8fbf8 50\.0%,#dfeae2 100\.0%\)/,
  "the renderer must preserve the sampled page background gradient",
);

const tocHtml = createGeometryStoryboardHtml(
  { number: 3, width: 500, height: 700 },
  {},
  {
    digitalPageNumber: 3,
    tocTitle: "Yaliyomo",
    tocEntries: [{ title: "Sura ya Kwanza", pageNumber: 6, level: 1 }],
  },
);
assert.match(tocHtml, /class="digital-toc"/);
assert.match(tocHtml, />Yaliyomo</);
assert.match(tocHtml, /Sura ya Kwanza/);
assert.match(tocHtml, /Digital page 6/);
assert.match(
  tocHtml,
  /litera-open-page/,
  "TOC entries must navigate the containing Litera storyboard instead of the srcDoc shell",
);

const arithmeticHtml = createGeometryStoryboardHtml(
  {
    number: 13,
    width: 500,
    height: 700,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 90, y: 220, w: 100, h: 20 },
        text: "50 × 2",
        font: { size: 12 },
      },
      { type: "image", bbox: { x: 90, y: 265, w: 80, h: 2 } },
    ],
  },
  {},
);
assert.match(
  arithmeticHtml,
  /class="source-answer-line"/,
  "printed arithmetic rules must become usable answer fields",
);
assert.match(
  arithmeticHtml,
  /data-latex="50 \\times\s+2"/,
  "mathematics must be authored as LaTeX and rendered to offline MathML",
);
assert.match(arithmeticHtml, /<math/, "LaTeX must be parsed into visible math");
assert.match(
  arithmeticHtml,
  /data-correct-answer="100"/,
  "arithmetic response fields must retain an exact answer for feedback",
);
assert.match(
  arithmeticHtml,
  /Not correct yet - try again/,
  "question pages must ship accessible correctness feedback",
);
assert.match(
  arithmeticHtml,
  /inputmode="decimal"/,
  "mathematical answers must open an appropriate input control",
);

const textualAnswerHtml = createGeometryStoryboardHtml(
  {
    number: 14,
    width: 500,
    height: 700,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 50, y: 180, w: 360, h: 20 },
        text: "What is the name of the shape?",
        font: { size: 12 },
      },
      {
        type: "text",
        bbox: { x: 50, y: 215, w: 180, h: 16 },
        text: "_ _ _ _ _ _ _ _",
        font: { size: 11 },
      },
    ],
  },
  {},
);
assert.match(
  textualAnswerHtml,
  /class="source-answer-line"/,
  "text-extracted dash and underscore rules must become usable answer fields",
);
assert.doesNotMatch(
  textualAnswerHtml,
  />_ _ _/,
  "the printed rule must not remain behind the interactive answer field",
);
assert.doesNotMatch(
  textualAnswerHtml,
  /inputmode="decimal"/,
  "general question rules must keep a text keyboard rather than force numeric input",
);

const semanticPanelHtml = createGeometryStoryboardHtml(
  {
    number: 8,
    width: 500,
    height: 700,
    layoutBlocks: [
      { type: "image", bbox: { x: 40, y: 70, w: 350, h: 50 } },
      {
        type: "text",
        bbox: { x: 50, y: 80, w: 300, h: 24 },
        text: "Heading inside semantic banner",
        font: { size: 16, color: "#ffffff" },
      },
    ],
    assets: [
      {
        id: "banner",
        kind: "image",
        blob: new Blob(),
        containsText: true,
        bounds: { x: 40, y: 70, w: 350, h: 50 },
      },
    ],
  },
  { banner: "data:image/png;base64,banner" },
  { decoration: { top: "#ffffff", bottom: "#ffffff", accent: "#176b3a" } },
);
assert.doesNotMatch(
  semanticPanelHtml,
  /data-semantic-decoration=/,
  "generic PDF image bounds must not become invented panels",
);
assert.match(
  semanticPanelHtml,
  />Heading inside semantic banner</,
  "panel text must remain semantic HTML",
);
assert.doesNotMatch(
  semanticPanelHtml,
  /<img/,
  "text-bearing panels must never be rendered as images",
);

const labelledIllustrationHtml = createGeometryStoryboardHtml(
  {
    number: 9,
    width: 500,
    height: 700,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 70, y: 95, w: 100, h: 20 },
        text: "Diagram label",
        font: { size: 12 },
      },
    ],
    assets: [
      {
        id: "illustration",
        kind: "image",
        blob: new Blob(),
        bounds: { x: 40, y: 60, w: 280, h: 220 },
      },
    ],
  },
  { illustration: "data:image/png;base64,illustration" },
);
assert.match(
  labelledIllustrationHtml,
  /<img[^>]+illustration/,
  "native illustrations must survive independent text labels that overlap their bounds",
);

const readableHtml = createGeometryStoryboardHtml(
  {
    number: 10,
    width: 500,
    height: 700,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 40, y: 80, w: 320, h: 18 },
        text: "Readable body copy",
        font: { size: 10, color: "#d8ddd9" },
      },
    ],
  },
  {},
  {
    decoration: {
      top: "#f5f8f5",
      bottom: "#ffffff",
      accent: "#176b3a",
      gradientStops: ["#f5f8f5", "#ffffff", "#f5f8f5"],
    },
  },
);
assert.doesNotMatch(
  readableHtml,
  /color:#d8ddd9/,
  "low-contrast source text must be corrected on pale gradients",
);
assert.match(
  readableHtml,
  />Readable body copy</,
  "contrast correction must not change semantic text",
);

const sanitized = sanitizeStoryboardHtml(
  `<!doctype html><html><head><style>@import "https://bad.test/x.css";main{background:url(https://bad.test/x)}</style><script>alert(1)</script></head><body onload="steal()"><a href="javascript:steal()">Page</a><iframe src="https://bad.test"></iframe></body></html>`,
);
assert.match(sanitized, /<!doctype html>/i);
assert.doesNotMatch(
  sanitized,
  /script|iframe|onload|javascript:|@import|url\s*\(/i,
);
assert.match(
  hydrateStoryboardAssets('<img src="litera-asset://page-4-image-0">', {
    "page-4-image-0": "data:image/png;base64,original",
  }),
  /data:image\/png;base64,original/,
);
assert.equal(
  storyboardImagesAreReferenced('<img src="litera-asset://figure-1">', [
    "figure-1",
  ]),
  true,
);
assert.equal(
  storyboardImagesAreReferenced(
    '<img src="litera-source://page" data-source-crop="0,0,500,700">',
    ["figure-1"],
  ),
  false,
  "source-page crops must never pass as storyboard images",
);
assert.equal(
  storyboardImagesAreReferenced(
    '<img src="data:image/png;base64,screenshot">',
    ["figure-1"],
  ),
  false,
  "embedded screenshots must never pass as storyboard images",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section class="bg-black text-gray-900">Unreadable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "invented black panels must be rejected",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section style="background:#050505;color:#111">Unreadable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "near-black inline surfaces must be rejected",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section class="bg-gradient-to-r from-black to-gray-900">Unreadable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "invented black gradient stops must be rejected",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section style="background:linear-gradient(#176b3a,#000000)">Unreadable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "near-black CSS gradient stops must be rejected",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section class="text-white bg-green-800/10">Unreadable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "white text on translucent pale panels must be rejected",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section class="bg-gradient-to-r from-green-100 to-green-200 text-white">Unreadable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "white text on pale gradients must be rejected",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<h1 class="text-white">One</h1><h2 class="text-white">Two</h2><aside class="bg-green-800">Panel</aside>',
    ["#176b3a", "#f4f7f3"],
  ),
  false,
  "each white-text region requires a genuinely dark supporting surface",
);
assert.equal(
  storyboardPaletteIsSafe(
    '<section style="background:#176b3a;color:#fff">Readable</section>',
    ["#176b3a", "#f4f7f3"],
  ),
  true,
  "a dark source-palette surface must remain valid",
);

class TestFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  readAsDataURL(blob: Blob) {
    void blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.();
      })
      .catch((error) => {
        this.error = error as Error;
        this.onerror?.();
      });
  }
}
async function testAiRenderer() {
  Object.assign(globalThis, { FileReader: TestFileReader });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{
        parts: Array<{ inlineData?: { data: string }; text?: string }>;
      }>;
    };
    assert.ok(
      body.contents[0]?.parts[0]?.inlineData?.data,
      "The persisted page image must reach the provider request.",
    );
    assert.ok(
      body.contents[0]?.parts.some((part) =>
        part.text?.includes("page-4-image-0"),
      ),
      "The asset manifest must identify original page visuals.",
    );
    assert.ok(
      body.contents[0]?.parts.some((part) =>
        part.text?.includes("Extracted geometry map"),
      ),
      "The provider must receive extracted page geometry.",
    );
    assert.ok(
      body.contents[0]?.parts.some((part) =>
        part.text?.includes("PRESERVE THE BOOK'S VISUAL IDENTITY"),
      ),
      "The provider must use ADT Studio's fidelity contract.",
    );
    assert.ok(
      body.contents[0]?.parts.filter((part) => part.inlineData).length >= 2,
      "The full page and extracted visual asset must both reach the provider.",
    );
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '<!doctype html><html lang="sw"><head><meta charset="utf-8"><style>.page{aspect-ratio:595/842;max-width:48rem;margin:auto;padding:2rem;font-family:Arial,sans-serif}.page h1{font-size:3rem}</style></head><body><main class="page"><h1>Mazingira</h1><img src="litera-asset://page-4-image-0" alt="Mti"><p>Ukurasa unaoweza kusomeka na kufikiwa.</p></main></body></html>',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const aiPage = await renderPageWithAi({
      image: new Blob(["persisted-page-image"], { type: "image/png" }),
      assets: [
        {
          id: "page-4-image-0",
          blob: new Blob(["original-asset"], { type: "image/png" }),
          bounds: { x: 30, y: 50, w: 120, h: 90 },
        },
      ],
      layoutBlocks: [
        {
          type: "text",
          bbox: { x: 20, y: 30, w: 200, h: 40 },
          text: "Mazingira",
          font: { family: "Arial", size: 28, weight: "bold" },
        },
      ],
      keys: {
        openai: "",
        gemini: "test-key",
        anthropic: "",
        azure: "",
        azureEndpoint: "",
        azureDeployment: "",
        custom: "",
        customEndpoint: "",
      },
      provider: "gemini",
      fontFamily: "Atkinson Hyperlegible",
      sourceWidth: 595,
      sourceHeight: 842,
    });
    assert.equal(aiPage.provider, "gemini");
    assert.match(aiPage.html, /Mazingira/);
    assert.match(aiPage.html, /litera-asset:\/\/page-4-image-0/);
    assert.match(aiPage.html, /main data-litera-page/);
    assert.doesNotMatch(aiPage.html, /overflow:hidden/);
    assert.doesNotMatch(
      aiPage.html,
      /litera-fidelity-page|litera-semantic-page/,
    );
    assert.equal(aiPage.fingerprint.length, 64);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function testAiRendererCancellation() {
  Object.assign(globalThis, { FileReader: TestFileReader });
  const previousFetch = globalThis.fetch;
  let requests = 0;
  const controller = new AbortController();
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
      queueMicrotask(() =>
        controller.abort(new DOMException("Stopped", "AbortError")),
      );
    });
  };
  const rendering = renderPageWithAi({
    image: new Blob(["page"], { type: "image/png" }),
    keys: {
      openai: "",
      gemini: "test-key",
      anthropic: "",
      azure: "",
      azureEndpoint: "",
      azureDeployment: "",
      custom: "",
      customEndpoint: "",
    },
    provider: "gemini",
    signal: controller.signal,
  });
  try {
    await assert.rejects(
      rendering,
      (error) => error instanceof DOMException && error.name === "AbortError",
    );
    assert.equal(requests, 1, "An aborted provider request must not retry.");
  } finally {
    globalThis.fetch = previousFetch;
  }
}

void testAiRenderer()
  .then(testAiRendererCancellation)
  .then(() => console.log("Storyboard engine regression tests passed."));

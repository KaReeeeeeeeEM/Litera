import assert from "node:assert/strict";
import { structurePageText } from "../src/lib/device-pipeline/structure-engine";

const page = structurePageText(
  3,
  `Mazingira Yetu

Mazingira ni kila kitu kinachotuzunguka. Tunapaswa kuyatunza.

- Panda miti
- Tupa taka kwenye pipa`,
);

assert.equal(page.pageNumber, 3);
assert.equal(page.title, "Mazingira Yetu");
assert.deepEqual(
  page.sections.map(({ kind }) => kind),
  ["heading", "paragraph", "list-item", "list-item"],
);
assert.equal(page.sections[2]?.text, "Panda miti");
assert.equal(page.sections[3]?.text, "Tupa taka kwenye pipa");

const blank = structurePageText(8, "  \n\n  ");
assert.equal(blank.title, "Page 8");
assert.deepEqual(blank.sections, []);
assert.deepEqual(blank.activities, []);

const numbered = structurePageText(2, "1. Soma kifungu\n2. Jibu maswali");
assert.deepEqual(
  numbered.sections.map(({ kind }) => kind),
  ["list-item", "list-item"],
);

const activityPage = structurePageText(
  5,
  "Zoezi: Jaza nafasi ____ katika sentensi.",
);
assert.equal(activityPage.activities[0]?.type, "fill-blank");
assert.equal(activityPage.activities[0]?.responseMode, "text");

const imperativeActivity = structurePageText(
  6,
  "Kazi ya kufanya\n1. Pima na rekodi urefu wa dawati lako.\n2. Badili urefu huo kuwa sentimeta.",
);
assert.equal(
  imperativeActivity.activities.length,
  2,
  "numbered imperatives under an activity heading must become learner interactions",
);
assert.ok(
  imperativeActivity.activities.every(
    (activity) => activity.type === "short-answer",
  ),
);

const referenceStyleQuestions = structurePageText(
  68,
  `Zoezi la 5
1. Kampuni ya kwanza ilitengeneza vitabu 5,900.
Kampuni nyingine ilitengeneza vitabu 3,600.
Je, kampuni hizo zilitengeneza jumla ya vitabu vingapi?
2. Eleza njia mbili unazoweza kutumia kupata jibu.`,
);
assert.equal(
  referenceStyleQuestions.activities.length,
  2,
  "each numbered question must receive its own response control",
);
assert.match(
  referenceStyleQuestions.activities[0]?.prompt ?? "",
  /5,900.*3,600.*vingapi/i,
  "wrapped source lines must remain one question",
);
assert.equal(
  referenceStyleQuestions.activities[0]?.inputMode,
  "numeric",
  "quantity questions must request a numeric keyboard",
);
assert.equal(referenceStyleQuestions.activities[0]?.multiline, false);
assert.equal(
  referenceStyleQuestions.activities[1]?.multiline,
  true,
  "explanations need a multiline response rather than a short input",
);

const repeatedBlanks = structurePageText(
  37,
  "Zoezi\n1. Jaza nafasi: ____ + ____ = ____",
);
assert.equal(
  repeatedBlanks.activities[0]?.answerCount,
  3,
  "every printed blank must have an answer input",
);

const trueFalse = structurePageText(
  41,
  "Activity 5: Write True or False.\n1. A noun names a person.\n2. A verb is an action word.",
);
assert.equal(trueFalse.activities.length, 2);
assert.ok(
  trueFalse.activities.every((activity) => activity.type === "true-false"),
  "the activity instruction must carry into every true-or-false statement",
);

const matching = structurePageText(
  42,
  "Activity 6: Match the items.\n1. cat - animal\n2. mango - fruit\n3. blue - colour",
);
assert.equal(matching.activities.length, 1);
assert.deepEqual(matching.activities[0]?.matchingPairs, [
  { left: "cat", right: "animal" },
  { left: "mango", right: "fruit" },
  { left: "blue", right: "colour" },
]);

const expandedForm = structurePageText(
  22,
  "Zoezi la 4\n1. Andika namba nzima kwa kifupi:\n(a) 9000 + 800 + 70 + 2 = ____",
);
assert.deepEqual(
  expandedForm.activities[0]?.correctAnswers,
  ["9872"],
  "expanded-form mathematics must produce a checkable answer",
);

const placeValue = structurePageText(
  10,
  "Zoezi\n1. Andika namba ambayo 2 iwe mamia, 9 mamoja, 3 maelfu na 8 makumi.",
);
assert.deepEqual(
  placeValue.activities[0]?.correctAnswers,
  ["3289"],
  "Swahili place-value questions must produce the same answer contract as the reference book",
);

assert.deepEqual(
  structurePageText(
    10,
    "Zoezi\n1. Katika 7029, ni tarakimu ipi ipo katika thamani ya nafasi ya mamia?",
  ).activities[0]?.correctAnswers,
  ["0"],
);
assert.deepEqual(
  structurePageText(
    37,
    "Zoezi\n1. Andika thamani ya nafasi ya 6 katika namba 645218.",
  ).activities[0]?.correctAnswers,
  ["600000"],
);
assert.deepEqual(
  structurePageText(10, "Zoezi\n1. Kuna mamia mangapi katika namba 3287?")
    .activities[0]?.correctAnswers,
  ["32"],
);

const clockQuestions = structurePageText(
  157,
  "Zoezi la marudio\n1. Chora nyuso za saa ya mshale kuonesha muda ufuatao:\n(a) Saa sita na robo (6:15)\n(b) Saa kumi kamili (10:00)",
);
assert.equal(clockQuestions.activities.length, 2);
assert.ok(
  clockQuestions.activities.every((activity) => activity.inputType === "time"),
  "clock-drawing questions must use an operable time input rather than a generic drawing textarea",
);
assert.match(clockQuestions.activities[0]?.prompt ?? "", /Chora.*6:15/i);

const workedExample = structurePageText(
  10,
  "Activity 4: Describing uses of common objects\nSay what the following things are used for.\nExample\nWhat is the pen used for?\nThe pen is used for writing.",
);
assert.equal(
  workedExample.activities.filter((activity) => activity.responseMode !== "none")
    .length,
  0,
  "a plain Example heading must stop written activity detection before its worked answer",
);
assert.equal(workedExample.activities[0]?.type, "no-input");

const splitOralReading = structurePageText(
  56,
  "Activity 3: Reading aloud grade-level texts\n(a) Read the following story aloud and answer the\nquestions that follow orally.\n1. What happened to Tupendane?",
);
assert.equal(
  splitOralReading.activities.filter(
    (activity) => activity.responseMode !== "none",
  ).length,
  0,
  "split-line oral reading instructions must not create written response controls",
);
assert.ok(
  splitOralReading.activities.some((activity) => activity.type === "no-input"),
  "oral activities must remain explicitly represented as no-input decisions",
);

const answerOrally = structurePageText(
  57,
  "Read the following story and answer the questions orally.\n1. Who visited the village?",
);
assert.equal(
  answerOrally.activities.filter((activity) => activity.responseMode !== "none")
    .length,
  0,
  "an explicit oral response must override the generic answer verb",
);
assert.ok(
  answerOrally.activities.some((activity) => activity.responseMode === "none"),
  "explicit oral-response instructions should be persisted as no-input activities",
);

const properNameRead = structurePageText(
  5,
  "The organisation, Room to Read, sponsored the early stages of this textbook.",
);
assert.equal(
  properNameRead.activities.length,
  0,
  "proper names containing Read must not become receptive activities",
);

const writeNumerals = structurePageText(
  20,
  "Exercise 2\nWrite the following numbers in numerals.\ntwo\nfour\nseven\nnine\none\nthree\nsix\nfive\neight",
);
assert.equal(writeNumerals.activities.length, 1);
assert.equal(writeNumerals.activities[0]?.answerCount, 9);
assert.deepEqual(writeNumerals.activities[0]?.correctAnswers, [
  "2",
  "4",
  "7",
  "9",
  "1",
  "3",
  "6",
  "5",
  "8",
]);

const visualComparison = structurePageText(
  8,
  "Exercise 1\nIdentify the group with few objects in each row.",
);
assert.equal(
  visualComparison.activities[0]?.type,
  "multiple-choice",
  "visual identification should be selectable rather than a discussion response",
);

const geometryReadingGrid = structurePageText(55, "fallback", [
  {
    type: "text",
    bbox: { x: 60, y: 60, w: 320, h: 24 },
    text: "Activity 2: Reading multi-syllable words",
    font: { size: 16 },
  },
  {
    type: "text",
    bbox: { x: 60, y: 95, w: 420, h: 20 },
    text: "(a) Read the word below each picture.",
    font: { size: 12 },
  },
  {
    type: "text",
    bbox: { x: 70, y: 150, w: 20, h: 18 },
    text: "(a)",
  },
  {
    type: "text",
    bbox: { x: 250, y: 150, w: 20, h: 18 },
    text: "(b)",
  },
]);
assert.equal(
  geometryReadingGrid.activities.filter(
    (activity) => activity.responseMode !== "none",
  ).length,
  0,
  "picture grids for reading practice must not be mistaken for answer activities",
);

const geometryPage = structurePageText(7, "fallback text", [
  {
    type: "text",
    bbox: { x: 40, y: 30, w: 320, h: 32 },
    text: "Sura ya Kwanza",
    font: { size: 26, weight: "bold" },
  },
  {
    type: "text",
    bbox: { x: 40, y: 100, w: 390, h: 14 },
    text: "Hii ni sentensi ya kwanza ya aya",
    font: { size: 11 },
  },
  {
    type: "text",
    bbox: { x: 40, y: 116, w: 360, h: 14 },
    text: "inayoendelea katika mstari mwingine.",
    font: { size: 11 },
  },
  {
    type: "text",
    bbox: { x: 40, y: 170, w: 250, h: 14 },
    text: "1. Pima urefu",
    font: { size: 11 },
  },
]);
assert.deepEqual(
  geometryPage.sections.map((section) => section.kind),
  ["heading", "paragraph", "list-item"],
);
assert.equal(
  geometryPage.sections[1]?.text,
  "Hii ni sentensi ya kwanza ya aya inayoendelea katika mstari mwingine.",
  "aligned PDF lines must become one semantic paragraph",
);
assert.equal(
  geometryPage.sections[0]?.level,
  1,
  "font hierarchy must produce a stable heading level",
);

console.log("Structure engine regression tests passed.");

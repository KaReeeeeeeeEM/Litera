import assert from "node:assert/strict";
import { buildTextCatalog } from "../src/lib/device-pipeline/language-engine";
import { structurePageText } from "../src/lib/device-pipeline/structure-engine";

const activityVariants = [
  "Trace zero by joining the dots.",
  "Practise writing the number 4 in the spaces.",
  "Draw three circles.",
  "Write the missing number ___.",
  "True or false: 2 is greater than 1.",
  "Match each number with its name.",
  "Choose the correct answer. A. 1 B. 2 C. 3",
  "Count the tomatoes and write the total.",
  "Colour two of the five shapes.",
  "Copy the letter A on the dotted guide.",
];
const prompts = activityVariants.flatMap((prompt) => [prompt, prompt]);

for (let batch = 0; batch < 10; batch += 1) {
  const pages = prompts.map((prompt, offset) => {
    const pageNumber = batch * 20 + offset + 1;
    const structured = structurePageText(pageNumber, `Exercise ${offset + 1}\n\n${prompt}`);
    assert.ok(structured.activities.length > 0, `batch ${batch + 1}, page ${pageNumber}: activity was not detected`);
    const activity = structured.activities[0]!;
    if (/trace|writing|draw|colour|copy/i.test(prompt)) {
      assert.equal(activity.responseMode, "drawing", `batch ${batch + 1}, page ${pageNumber}: canvas activity required`);
    } else {
      assert.notEqual(activity.responseMode, "none", `batch ${batch + 1}, page ${pageNumber}: answer control required`);
    }
    return {
      pageNumber,
      status: "ready" as const,
      storyboardedAt: new Date(0).toISOString(),
      title: `Exercise ${offset + 1}`,
      layout: "activity" as const,
      sourceWidth: 600,
      sourceHeight: 800,
      sourceMasks: [],
      html: "<main></main>",
      blocks: [
        { id: `p${pageNumber}-prompt`, kind: "text" as const, content: prompt, order: 0, sourceBounds: { x: 40, y: 80, w: 480, h: 30 } },
        { id: `p${pageNumber}-zero-a`, kind: "text" as const, content: "0", order: 1, sourceBounds: { x: 100, y: 220, w: 30, h: 30 } },
        { id: `p${pageNumber}-zero-b`, kind: "text" as const, content: "0", order: 2, sourceBounds: { x: 220, y: 220, w: 30, h: 30 } },
        { id: `p${pageNumber}-figure`, kind: "image" as const, content: "Three tomatoes arranged from left to right.", accessibleLabel: "Three tomatoes arranged from left to right.", assetId: `asset-${pageNumber}`, order: 3, sourceBounds: { x: 80, y: 330, w: 280, h: 160 } },
      ],
    };
  });
  const catalog = buildTextCatalog({ storyboardPages: pages } as unknown as Parameters<typeof buildTextCatalog>[0]);
  assert.equal(catalog.filter((entry) => entry.text === "0").length, 40, `batch ${batch + 1}: repeated table cells were skipped`);
  assert.equal(catalog.filter((entry) => /Three tomatoes/.test(entry.text)).length, 20, `batch ${batch + 1}: figure captions were skipped`);
}

console.log("Ten 20-page activity batches passed (200 pages)." );

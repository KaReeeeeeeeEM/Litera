import type {
  ActivityType,
  ExtractedLayoutBlock,
  StructuredActivity,
  StructuredPage,
  StructuredSection,
} from "@/components/device/device-types";
import { inferCorrectAnswers } from "@/lib/device-pipeline/math-content-engine";

const listPattern = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const activityHeadingPattern =
  /^(?:(?:activity|exercise|practice|question|zoezi|maswali)\b|shughuli(?:\s+(?:ya\s+)?\d+|\s*[:.–—-]|\s*$)|kazi ya kufanya|jaribio)/i;

function normalizedBlocks(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function looksLikeHeading(text: string, index: number) {
  if (text.includes("\n") || text.length > 100 || /[.!?,;:]$/.test(text))
    return false;
  const words = text.split(/\s+/);
  const titleWords = words.filter((word) => /^[A-ZÀ-ÖØ-Þ0-9]/.test(word));
  return (
    index === 0 ||
    text === text.toUpperCase() ||
    titleWords.length >= Math.ceil(words.length * 0.6)
  );
}

export function structurePageText(
  pageNumber: number,
  sourceText: string,
  layoutBlocks: ExtractedLayoutBlock[] = [],
): StructuredPage {
  const geometrySections = structureGeometry(pageNumber, layoutBlocks);
  const sections: StructuredSection[] = [];
  const blocks = normalizedBlocks(sourceText);

  blocks.forEach((block, blockIndex) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const allListItems =
      lines.length > 0 && lines.every((line) => listPattern.test(line));

    if (allListItems) {
      lines.forEach((line, lineIndex) => {
        sections.push({
          id: `page-${pageNumber}-list-${blockIndex}-${lineIndex}`,
          kind: "list-item",
          text: line.replace(listPattern, "$1").trim(),
        });
      });
      return;
    }

    if (looksLikeHeading(block, blockIndex)) {
      sections.push({
        id: `page-${pageNumber}-heading-${blockIndex}`,
        kind: "heading",
        level: blockIndex === 0 ? 1 : 2,
        text: block.replace(/\n+/g, " "),
      });
      return;
    }

    sections.push({
      id: `page-${pageNumber}-paragraph-${blockIndex}`,
      kind: "paragraph",
      text: block.replace(/\n+/g, " "),
    });
  });

  const finalSections = geometrySections.length ? geometrySections : sections;
  const title =
    finalSections.find((section) => section.kind === "heading")?.text ??
    finalSections.find((section) => section.text)?.text.slice(0, 72) ??
    `Page ${pageNumber}`;

  const detectedActivities = detectActivities(
    pageNumber,
    sourceText,
    layoutBlocks,
  );
  const geometryActivities = geometryActivityFallback(pageNumber, layoutBlocks);
  const responseActivities =
    geometryActivities.length > 0 &&
    (detectedActivities.length === 0 ||
      detectedActivities.length > geometryActivities.length * 2)
      ? geometryActivities
      : detectedActivities;
  const noInputActivities = detectNoInputActivities(
    pageNumber,
    sourceText,
    layoutBlocks,
  );
  // The response-mode gate is authoritative. A generic verb such as “answer”
  // must not create a textbox when the same instruction explicitly says that
  // the response is oral, collaborative, receptive, or physical.
  const writtenResponseActivities = responseActivities.filter(
    (activity) => !isExplicitNoInputInstruction(activity.prompt),
  );
  const activities = [...writtenResponseActivities, ...noInputActivities];
  return {
    pageNumber,
    status: "ready",
    structuredAt: new Date().toISOString(),
    title,
    sections: finalSections,
    activities,
  };
}

function detectNoInputActivities(
  pageNumber: number,
  sourceText: string,
  layoutBlocks: ExtractedLayoutBlock[],
): StructuredActivity[] {
  const source = layoutBlocks.length
    ? layoutBlocks
        .filter((block) => block.type === "text" && block.text?.trim())
        .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
        .map((block) => block.text!.trim())
        .join("\n")
    : sourceText;
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // "Room to Read" and similar proper names must not be treated as reading
  // activities. Receptive instructions begin with an instruction verb.
  const receptiveReadOnly =
    /^(?:please\s+)?(?:read|practise reading|practice reading|soma)\b/i;
  const requiresResponse =
    /\b(?:answer(?: the)? questions?|write|complete|fill|calculate|solve|andika|jibu|jaza|kokotoa|hesabu)\b|\?/i;
  const prompts = lines.filter(
    (line) =>
      (isExplicitNoInputInstruction(line) ||
        (receptiveReadOnly.test(line) && !requiresResponse.test(line))),
  );
  return [...new Set(prompts)].map((prompt, index) => ({
    id: `page-${pageNumber}-no-input-${index}`,
    pageNumber,
    type: "no-input" as const,
    prompt,
    confidence: 0.96,
    ...activityMetadata("no-input"),
    noInputReason:
      "The local instruction is oral, receptive, collaborative, or physical and does not request an on-page written response.",
  }));
}

function isExplicitNoInputInstruction(text: string) {
  const explicitNoInput =
    /\borally\b|\baloud\b|\b(?:listen|repeat|pronounce|say|tell|discuss|observe|study|act out|sing|role[- ]?play|demonstrate)\b|\b(?:work|ask and answer) in pairs?\b|\bsoma\s+kwa\s+sauti\b|\bsema\s+kwa\s+sauti\b/i;
  const writtenStage =
    /\b(?:then|and)\s+(?:write|answer in writing|record|complete|andika|jibu kwa kuandika|jaza)\b/i;
  return explicitNoInput.test(text) && !writtenStage.test(text);
}

function geometryActivityFallback(
  pageNumber: number,
  layoutBlocks: ExtractedLayoutBlock[],
): StructuredActivity[] {
  const textBlocks = layoutBlocks.filter(
    (block) => block.type === "text" && block.text?.trim(),
  );
  const heading = textBlocks.find((block) =>
    activityHeadingPattern.test(block.text!.trim()),
  );
  const continuationEquations = textBlocks.filter((block) =>
    /^(?:=\s*(?:\?|[_–—-]+)?|.*\d\s*(?:[+\-−×x÷])\s*\d[^=]{0,36}=\s*(?:\?|[_–—-]+)?)$/.test(
      block.text!.replace(/\s+/g, " ").trim(),
    ),
  );
  const letteredContinuationLabels = textBlocks.filter((block) =>
    /^(?:\([a-z]\)|[a-z][.)])$/i.test(block.text!.trim()),
  );
  const numberedContinuationLabels = textBlocks.filter((block) =>
    /^\d{1,2}[.)](?:\s+\S.*)?$/.test(block.text!.trim()),
  );
  const continuationLabels =
    letteredContinuationLabels.length >= 3
      ? letteredContinuationLabels
      : numberedContinuationLabels;
  const hasWorkedExampleHeading = textBlocks.some((block) =>
    /^(?:mfano|example)(?:\s+(?:wa\s+)?\d+)?\b/i.test(block.text!.trim()),
  );
  const continuation =
    !heading &&
    !hasWorkedExampleHeading &&
    continuationEquations.length >= 3 &&
    continuationLabels.length >= 3;
  const proseQuestionLabels = numberedContinuationLabels
    .filter((label) => {
      const next = numberedContinuationLabels
        .filter((candidate) => candidate.bbox.y > label.bbox.y)
        .sort((a, b) => a.bbox.y - b.bbox.y)[0];
      return textBlocks.some((block) =>
        block.bbox.y >= label.bbox.y &&
        block.bbox.y < (next?.bbox.y ?? label.bbox.y + 180) &&
        /\?|\b(?:je|gani|ngapi|what|which|how|calculate|find)\b/i.test(block.text ?? ""),
      );
    })
    .sort((a, b) => a.bbox.y - b.bbox.y);
  const proseContinuation = !heading && !hasWorkedExampleHeading && proseQuestionLabels.length >= 2;
  if (!heading && !continuation && !proseContinuation) return [];
  const afterHeading = heading
    ? textBlocks.filter((block) => block.bbox.y > heading.bbox.y)
    : textBlocks;
  const instructionText = [...(heading ? [heading] : []), ...afterHeading.slice(0, 12)]
    .map((block) => block.text!.trim())
    .join(" ");
  const responseAction =
    /\b(?:answer|write|complete|fill|choose|select|match|calculate|solve|draw|andika|jibu|jaza|chagua|oanisha|kokotoa|hesabu|chora)\b|(?:[_\p{Pd}]\s*){3,}|\?/iu;
  if (
    /\borally\b|\baloud\b|\bsoma\s+kwa\s+sauti\b/i.test(instructionText) ||
    (/\b(?:read|practise|practice|soma)\b/i.test(instructionText) &&
      !responseAction.test(instructionText))
  )
    return [];
  const letterLabels = afterHeading.filter((block) =>
    /^(?:\([a-j]\)|[a-j][.)])$/i.test(block.text!.trim()),
  );
  const itemLabels = (
    letterLabels.length >= 2
      ? letterLabels
      : afterHeading.filter((block) => /^\d{1,2}[.)](?:\s+\S.*)?$/.test(block.text!.trim()))
  ).sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  if (itemLabels.length < 2) return [];
  const headingText = heading?.text!.trim() ?? "Continued exercise: calculate";
  const type = activityType(headingText);
  const responseLabels = proseContinuation
    ? proseQuestionLabels
    : continuation
    ? continuationLabels.sort(
        (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
      )
    : itemLabels;
  return responseLabels.map((label, index) => {
    const nextTop = responseLabels[index + 1]?.bbox.y ?? Number.POSITIVE_INFINITY;
    const promptBlocks = textBlocks.filter((block) => block.bbox.y >= label.bbox.y && block.bbox.y < nextTop);
    const prompt = proseContinuation
      ? promptBlocks.map((block) => block.text!.trim()).join(" ").replace(/\s+/g, " ")
      : `${headingText} ${label.text!.trim()}`;
    return {
      id: `page-${pageNumber}-geometry-activity-${index}`,
      pageNumber,
      type: activityType(prompt),
      prompt,
      confidence: proseContinuation ? 0.93 : 0.84,
      ...activityMetadata(activityType(prompt)),
      ...responsePresentation(prompt, activityType(prompt)),
      correctAnswers: inferCorrectAnswers(prompt),
      sourceBounds: boundsForBlocks(promptBlocks.length ? promptBlocks : [label]),
    };
  });
}

function structureGeometry(
  pageNumber: number,
  layoutBlocks: ExtractedLayoutBlock[],
): StructuredSection[] {
  const lines = layoutBlocks
    .filter(
      (block) =>
        block.type === "text" &&
        block.text?.trim() &&
        !/for online (?:reading|use) only|\.indd\s+\d/i.test(block.text),
    )
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  if (lines.length < 3) return [];
  const sizes = lines
    .map((line) => line.font?.size ?? Math.max(7, line.bbox.h * 0.75))
    .sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length / 2)] ?? 10;
  const output: StructuredSection[] = [];
  let paragraph: ExtractedLayoutBlock[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const text = paragraph
      .map((line) => line.text!.trim())
      .reduce((joined, line) =>
        /[-‐‑]$/.test(joined)
          ? `${joined.slice(0, -1)}${line}`
          : `${joined} ${line}`,
      );
    output.push({
      id: `page-${pageNumber}-geometry-paragraph-${output.length}`,
      kind: "paragraph",
      text: text.replace(/\s+/g, " ").trim(),
      sourceBounds: boundsForBlocks(paragraph),
    });
    paragraph = [];
  };
  for (const line of lines) {
    const text = line.text!.replace(/\s+/g, " ").trim();
    if (
      line.bbox.y >
        Math.max(
          ...lines.map((candidate) => candidate.bbox.y + candidate.bbox.h),
        ) *
          0.9 &&
      /^(?:\d{1,4}|[ivxlcdm]+)$/i.test(text)
    )
      continue;
    const size = line.font?.size ?? Math.max(7, line.bbox.h * 0.75);
    const bold = /bold|black|heavy|semibold/i.test(
      `${line.font?.weight ?? ""} ${line.font?.name ?? ""}`,
    );
    const heading =
      text.length <= 140 &&
      (size >= bodySize * 1.32 || (bold && size >= bodySize * 1.08));
    const listed = listPattern.test(text);
    if (heading || listed) {
      flush();
      output.push({
        id: `page-${pageNumber}-geometry-${heading ? "heading" : "list"}-${output.length}`,
        kind: heading ? "heading" : "list-item",
        level: heading
          ? size >= bodySize * 1.8
            ? 1
            : size >= bodySize * 1.35
              ? 2
              : 3
          : undefined,
        text: listed ? text.replace(listPattern, "$1").trim() : text,
        sourceBounds: { ...line.bbox },
      });
      continue;
    }
    const previous = paragraph.at(-1);
    const gap = previous
      ? line.bbox.y - (previous.bbox.y + previous.bbox.h)
      : 0;
    const aligned =
      !previous ||
      Math.abs(line.bbox.x - previous.bbox.x) <=
        Math.max(24, previous.bbox.w * 0.12);
    if (previous && (gap > Math.max(8, bodySize * 1.15) || !aligned)) flush();
    paragraph.push(line);
  }
  flush();
  return output;
}

function boundsForBlocks(blocks: ExtractedLayoutBlock[]) {
  const left = Math.min(...blocks.map((block) => block.bbox.x));
  const top = Math.min(...blocks.map((block) => block.bbox.y));
  const right = Math.max(...blocks.map((block) => block.bbox.x + block.bbox.w));
  const bottom = Math.max(...blocks.map((block) => block.bbox.y + block.bbox.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function activityType(text: string): ActivityType {
  if (/((?:[_–—-]\s*){3,}|fill (?:in )?(?:the )?(?:blank|missing)|jaza nafasi)/i.test(text))
    return "fill-blank";
  if (/(match|oanisha|linganisha)/i.test(text)) return "matching";
  if (/(true or false|kweli au si kweli)/i.test(text)) return "true-false";
  if (/(choose|select|chagua|circle).*(answer|jibu)/i.test(text))
    return "multiple-choice";
  if (
    /\b(?:identify|compare|pick|point to|onyesha|tambua|linganisha)\b/i.test(text) &&
    /\b(?:group|objects?|pictures?|rows?|kikundi|vitu|picha)\b/i.test(text)
  )
    return "multiple-choice";
  if (/(draw|chora).*(?:clock|saa|muda)/i.test(text)) return "short-answer";
  if (/(draw|chora|colour|color)/i.test(text)) return "drawing";
  if (/(discuss|jadili|in (?:pairs?|groups?)|kwa vikundi|kikundi cha)/i.test(text))
    return "discussion";
  return "short-answer";
}

function responsePresentation(text: string, type: ActivityType) {
  const time =
    /(?:draw|chora).*(?:clock|saa|muda)|(?:clock|saa|muda).*(?:draw|chora)/i.test(
      text,
    );
  const numeric =
    /(?:\d\s*(?:[+×÷=]|-|−)|\b(?:calculate|difference|find the (?:sum|product)|hesabu|jumla|ngapi|tofauti|thamani|idadi|pima|kipimo)\b)/i.test(
      text,
    );
  const decimal =
    /(?:decimal|desimali|\.\d|lita|mililita|cm|mm|kg|gramu)/i.test(text);
  const multiline =
    type === "drawing" ||
    type === "discussion" ||
    /\b(?:describe|discuss|eleza|fafanua|jadili|orodhesha|taja mifano|andika sentensi|toa sababu)\b/i.test(
      text,
    );
  const numberWordAnswers = [
    ...text.matchAll(
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    ),
  ].map((match) => match[1]!.toLocaleLowerCase());
  const answerCount =
    type === "fill-blank"
      ? Math.max(1, (text.match(/(?:[_–—-]\s*){3,}/g) ?? []).length)
      : /\bwrite\b.*\b(?:numbers?|numerals?)\b/i.test(text) &&
          numberWordAnswers.length >= 2
        ? numberWordAnswers.length
      : 1;
  return {
    inputType: time ? ("time" as const) : ("text" as const),
    inputMode: numeric
      ? decimal
        ? ("decimal" as const)
        : ("numeric" as const)
      : ("text" as const),
    multiline,
    answerCount,
  };
}

function activityMetadata(type: ActivityType) {
  switch (type) {
    case "no-input":
      return {
        responseMode: "none" as const,
        accessibilityHint:
          "Preserve the activity instructions without adding a digital response control.",
      };
    case "multiple-choice":
      return {
        responseMode: "choice" as const,
        accessibilityHint:
          "Render choices as a labelled radio group with keyboard and screen-reader support.",
      };
    case "true-false":
      return {
        responseMode: "choice" as const,
        accessibilityHint:
          "Render two explicit labelled choices; never communicate correctness by color alone.",
      };
    case "fill-blank":
      return {
        responseMode: "text" as const,
        accessibilityHint:
          "Give every blank a visible and programmatic label derived from its sentence.",
      };
    case "matching":
      return {
        responseMode: "choice" as const,
        accessibilityHint:
          "Provide select controls as an alternative to drag-and-drop matching.",
      };
    case "drawing":
      return {
        responseMode: "drawing" as const,
        accessibilityHint:
          "Provide a text-description response alongside the drawing canvas.",
      };
    case "discussion":
      return {
        responseMode: "discussion" as const,
        accessibilityHint:
          "Allow typed, recorded, or signed responses without imposing a timer.",
      };
    default:
      return {
        responseMode: "text" as const,
        accessibilityHint:
          "Use a labelled multiline answer field with speech-input compatibility.",
      };
  }
}

function choiceOptions(prompt: string) {
  return [
    ...prompt.matchAll(
      /(?:^|\s)(?:\(?[A-Da-d]\)?[.)])\s+(.+?)(?=(?:\s+\(?[A-Da-d]\)?[.)]\s+)|$)/g,
    ),
  ]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function matchingPairs(prompt: string) {
  return [
    ...prompt.matchAll(
      /(?:^|\s)(?:\d+[.)])\s*([^;|]+?)\s*(?:[-–—:↔]|\bwith\b|\bna\b)\s*([^;|]+?)(?=(?:\s*\|\s*)?\d+[.)]|$)/gi,
    ),
  ]
    .map((match) => ({ left: match[1]!.trim(), right: match[2]!.trim() }))
    .filter((pair) => pair.left.length > 0 && pair.right.length > 0);
}

function matchingPairsFromColumns(source: string) {
  const columnIndex = source.toLocaleLowerCase().indexOf("column b");
  if (columnIndex < 0) return [];
  const names: string[] = [];
  for (const rawLine of source.slice(columnIndex + 8).split(/\n+/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (
      !line ||
      /^(?:s\/n|\d+[.)]?|[-–—_]{3,}|\d{1,2}\/\d{1,2}\/\d{4}.*)$/i.test(line) ||
      /^column [ab]$/i.test(line)
    )
      continue;
    if (line.length <= 4 && line === line.toUpperCase()) continue;
    if (names.at(-1)?.endsWith(" or")) names[names.length - 1] += ` ${line}`;
    else if (/^[\p{L}][\p{L}\s'-]{1,48}$/u.test(line)) names.push(line);
  }
  const unique = [...new Set(names)].slice(0, 12);
  return unique.length >= 2
    ? unique.map((right, index) => ({
        left: `Picture ${index + 1}`,
        right,
      }))
    : [];
}

function numberWordCorrectAnswers(prompt: string) {
  if (!/\bwrite\b.*\b(?:numbers?|numerals?)\b/i.test(prompt)) return [];
  const values: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
  };
  return [...prompt.matchAll(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)]
    .map((match) => values[match[1]!.toLocaleLowerCase()]!)
    .filter(Boolean);
}

export function detectActivities(
  pageNumber: number,
  sourceText: string,
  layoutBlocks: ExtractedLayoutBlock[] = [],
): StructuredActivity[] {
  const geometryText = layoutBlocks
    .filter((block) => block.type === "text" && block.text?.trim())
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
    .map((block) => block.text!.trim())
    .join("\n");
  const activitySource = geometryText.length > 20 ? geometryText : sourceText;
  const lines = activitySource
    .replace(/\r\n?/g, "\n")
    .replace(
      /\s+(?=(?:mfano|example)\s+(?:wa\s+)?\d+\b|(?:zoezi|exercise|activity|maswali|shughuli)\b)/gi,
      "\n",
    )
    .replace(
      /\s+(?=\d+[.)]\s+(?:andika|jaza|chagua|chora|hesabu|taja|eleza|oanisha)\b)/gi,
      "\n",
    )
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const activityHeading = activityHeadingPattern;
  const imperative =
    /^(?:\d+[.)]\s*)?(?:answer|write|fill|complete|count|mark|shade|andika|badili|calculate|chagua|chora|compare|describe|discuss|eleza|find|hesabu|identify|jadili|jaza|jibu|linganisha|match|measure|oanisha|pima|record|rekodi|select|solve|taja|weka)\b/i;
  const itemStart = /^(?:\d+[.)]|\([a-z]\)|[a-z][.)])\s+/i;
  const exampleHeading = /^(?:mfano|example)(?:\s+(?:wa\s+)?\d+)?\b/i;
  const oralInstruction =
    /\borally\b|\baloud\b|\bsoma\s+kwa\s+sauti\b|\bsema\s+kwa\s+sauti\b/i;
  let inActivity = false;
  let inExample = false;
  let inOral = false;
  let current = "";
  let currentIsItem = false;
  let instructionContext = "";
  const candidates: string[] = [];
  const responsePrompt = (value: string) =>
    !isMetadataIdentifier(value) &&
    /\?|(?:[_–—-]\s*){3,}|\d\s*[+×÷−-]\s*\d|\b(?:answer|write|fill|complete|count|mark|shade|andika|badili|calculate|chagua|chora|compare|describe|discuss|eleza|find|hesabu|identify|jadili|jaza|jibu|linganisha|match|measure|oanisha|orodhesha|pima|record|rekodi|select|solve|taja|weka)\b/i.test(value);
  const flush = () => {
    const prompt = current.replace(/\s+/g, " ").trim();
    const readOnlyInstruction =
      /\b(?:read|practise|practice|soma)\b/i.test(prompt) &&
      !responsePrompt(prompt);
    const instructionOnly =
      !currentIsItem &&
      /\b(?:true or false|kweli au si kweli|match|matching|oanisha|linganisha|choose|select|chagua)\b/i.test(
        prompt,
      );
    if (/:$/.test(prompt) || instructionOnly) instructionContext = prompt;
    else if (
      !readOnlyInstruction &&
      prompt.length > 4 &&
      (responsePrompt(prompt) || currentIsItem)
    )
      candidates.push(prompt);
    current = "";
    currentIsItem = false;
  };
  for (const line of lines) {
    if (activityHeading.test(line)) {
      flush();
      inExample = false;
      if (oralInstruction.test(line)) {
        inActivity = false;
        inOral = true;
        continue;
      }
      inActivity = true;
      inOral = false;
      const inlinePrompt = line
        .replace(activityHeading, "")
        .replace(/^\s*[:.–—-]\s*/, "")
        .trim();
      if (
        inlinePrompt.length > 5 &&
        (responsePrompt(inlinePrompt) ||
          /\b(?:true or false|kweli au si kweli|match|matching|oanisha|linganisha|choose|select|chagua)\b/i.test(
            inlinePrompt,
          ))
      )
        current = inlinePrompt;
      continue;
    }
    if (oralInstruction.test(line)) {
      flush();
      inActivity = false;
      inOral = true;
      continue;
    }
    if (inOral) continue;
    if (exampleHeading.test(line)) {
      flush();
      inExample = true;
      inActivity = false;
      continue;
    }
    if (inExample) continue;
    if (inActivity && itemStart.test(line)) {
      if (
        current &&
        /\b(?:match|matching|oanisha|linganisha)\b/i.test(instructionContext)
      ) {
        current += ` | ${line}`;
        currentIsItem = true;
        continue;
      }
      flush();
      current = instructionContext ? `${instructionContext} ${line}` : line;
      currentIsItem = true;
      continue;
    }
    if (inActivity && current) {
      current += ` ${line}`;
      continue;
    }
    const candidate =
      line.length > 5 &&
      (responsePrompt(line) ||
        /^\s*(?:question|swali)\b/i.test(line) ||
        (inActivity && imperative.test(line)));
    if (candidate) {
      if (current) flush();
      current = line;
      currentIsItem = itemStart.test(line);
    }
    if (
      inActivity &&
      !/^\d+[.)]/.test(line) &&
      !imperative.test(line) &&
      line.length < 80 &&
      /^[\p{Lu}\d]/u.test(line)
    )
      inActivity = false;
  }
  flush();

  const numberedRegions = layoutBlocks
    .filter((block) => block.type === "text" && /^\d{1,2}[.)](?:\s+\S.*)?$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
    .map((label, index, labels) => {
      const nextTop = labels[index + 1]?.bbox.y ?? Number.POSITIVE_INFINITY;
      return boundsForBlocks(layoutBlocks.filter((block) => block.bbox.y >= label.bbox.y && block.bbox.y < nextTop));
    });
  const detected = [...new Set(candidates)].map((prompt, index) => {
    const type = activityType(prompt);
    const options = choiceOptions(prompt);
    const explicitPairs = type === "matching" ? matchingPairs(prompt) : [];
    const pairs =
      type === "matching" && explicitPairs.length < 2
        ? matchingPairsFromColumns(activitySource)
        : explicitPairs;
    const inferredAnswers = inferCorrectAnswers(prompt);
    const wordAnswers = numberWordCorrectAnswers(prompt);
    return {
      id: `page-${pageNumber}-activity-${index}`,
      pageNumber,
      type,
      prompt: prompt.replace(
        /^\s*(?:activity|exercise|question|zoezi|swali)\s*[:.-]?\s*/i,
        "",
      ),
      confidence: /^(?:activity|exercise|question|zoezi|swali|\d+[.)])/i.test(
        prompt,
      )
        ? 0.92
        : 0.78,
      ...activityMetadata(type),
      ...responsePresentation(prompt, type),
      options: options.length >= 2 ? options : undefined,
      matchingPairs: pairs.length >= 2 ? pairs : undefined,
      correctAnswers: wordAnswers.length ? wordAnswers : inferredAnswers,
      sourceBounds: numberedRegions[index],
    };
  });
  const matching = detected.filter((activity) => activity.type === "matching");
  if (!matching.length) return detected;
  return detected.filter(
    (activity) =>
      activity.type !== "fill-blank" ||
      !/^(?:[_–—-]\s*){3,}$/.test(activity.prompt.trim()),
  );
}

function isMetadataIdentifier(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (/\b(?:isbn|issn|simu|tel(?:ephone)?|phone|fax|tarehe|date)\s*:/i.test(normalized))
    return true;
  return (
    !/[=?]/.test(normalized) &&
    (normalized.match(/\d+/g)?.length ?? 0) >= 4 &&
    (normalized.match(/[-−]/g)?.length ?? 0) >= 3
  );
}

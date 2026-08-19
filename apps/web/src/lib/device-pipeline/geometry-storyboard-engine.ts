import type {
  ExtractedLayoutBlock,
  ExtractedPageAsset,
} from "@/components/device/device-types";
import {
  inferCorrectAnswers,
  renderMathInText,
} from "@/lib/device-pipeline/math-content-engine";
import { collapseRepeatedDisplayText } from "@/lib/device-pipeline/text-layer-deduplication";

type GeometryPage = {
  number: number;
  width?: number;
  height?: number;
  text?: string;
  layoutBlocks?: ExtractedLayoutBlock[];
  assets?: ExtractedPageAsset[];
};
type GeometryRenderOptions = {
  fontFamily?: string;
  sourcePageUrl?: string;
  digitalPageNumber?: number;
  digitalPageCount?: number;
  decoration?: {
    top: string;
    bottom: string;
    accent: string;
    gradientStops?: string[];
    gradientAngle?: number;
    suppressTopStrip?: boolean;
  };
  tocEntries?: Array<{ title: string; pageNumber: number; level: number }>;
  tocTitle?: string;
  activityPrompts?: string[];
};
const nonContentText =
  /for online (?:reading|use) only|\.indd\s+\d|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?/i;
const answerRuleSource = String.raw`(?:\.{3,}|(?:[_\p{Pd}]\s*){3,})`;
const oralInstruction =
  /\borally\b|\bcount\s+and\s+read\b|\b(?:read|practise|practice)\s+(?:the\s+.+\s+)?aloud\b|\b(?:answer|describe|discuss|say)\s+(?:the\s+.+\s+)?orally\b|\bpronounc(?:e|iation)\b|\bsoma\s+kwa\s+sauti\b|\bsema\s+kwa\s+sauti\b/i;
const activityHeadingPattern =
  /^(?:(?:activity|exercise|practice|zoezi|maswali)\b|shughuli(?:\s+(?:ya\s+)?\d+|\s*[:.–—-]|\s*$))/i;

// Headings and instructional labels repeat verbatim across many pages
// ("Exercise 1", "Chapter Two", chapter subtitles), but this module renders
// one page at a time with no shared style table, so each occurrence's
// font-family/size used to get independently re-derived from that page's
// own PDF/OCR font metadata - noise that can drift slightly page to page
// even though the printed book shows the exact same heading style every
// time. Cache the first-seen style per exact heading text (module-level so
// it persists across every page rendered in one session) and reuse it for
// every later occurrence instead of re-deriving it from noisier per-page
// data.
const canonicalHeadingStyles = new Map<string, { size: number; family: string }>();

function answerRuleMatches(value: string) {
  return [...value.matchAll(new RegExp(answerRuleSource, "gu"))];
}

export function createGeometryStoryboardHtml(
  page: GeometryPage,
  imageUrls: Record<string, string>,
  config?: string | GeometryRenderOptions,
) {
  const width = Math.max(1, page.width ?? 612);
  const height = Math.max(1, page.height ?? 792);
  const options =
    typeof config === "string" ? { fontFamily: config } : (config ?? {});
  const decoration = options.decoration ?? {
    top: "#ffffff",
    bottom: "#ffffff",
    accent: "#176b3a",
  };
  const gradientStops = (
    decoration.gradientStops?.length
      ? decoration.gradientStops
      : [decoration.top, "#ffffff", decoration.bottom]
  ).map(safeColor);
  const pageSurface =
    gradientStops[Math.floor(gradientStops.length / 2)] ?? "#ffffff";
  const rawTextBlocks = (page.layoutBlocks ?? []).filter(
    (block) =>
      block.type === "text" &&
      block.text?.trim() &&
      !isNonContentBlock(block, height),
  );
  // Composed examples are genuine teaching diagrams recovered from a bounded
  // source region, not page screenshots. They can contain printed labels, so
  // keep those exact visuals while retaining duplicate text only for AT.
  const deduplicatedAssets = deduplicateVisualAssets(
    (page.assets ?? []).filter(
      (asset) =>
        !asset.containsText ||
        asset.id.includes("composite-example") ||
        asset.id.includes("composite-activity-diagram"),
    ),
  );
  const activityComposites = deduplicatedAssets.filter((asset) =>
    asset.id.includes("composite-activity-diagram"),
  );
  const visibleAssets = activityComposites.length
    ? deduplicatedAssets.filter((asset) =>
        asset.id.includes("composite-activity-diagram") ||
        !activityComposites.some((composite) =>
          boundsOverlap(composite.bounds, asset.bounds) > 0.18,
        ),
      )
    : deduplicatedAssets;
  const composedExampleBounds = visibleAssets
    .filter(
      (asset) =>
        asset.id.includes("composite-example") ||
        asset.id.includes("composite-activity-diagram"),
    )
    .map((asset) => asset.bounds);
  const blocks = repairSplitActivityHeadings(
    deduplicateTextBlocks(rawTextBlocks),
    width,
    height,
  );
  // Repeated short response stems such as “He is …” are legitimate separate
  // questions in picture grids. Content de-duplication must never erase their
  // answer rules merely because the printed wording is identical.
  const textualAnswerBlocks = deduplicateAnswerRules(
    rawTextBlocks.filter(
      (block) =>
        isTextualAnswerRule(block) &&
        !belongsToWorkedExample(block, rawTextBlocks) &&
        !belongsToOralRegion(block, rawTextBlocks),
    ),
  );
  const contentBlocks = blocks.filter(
    (block) => !textualAnswerBlocks.includes(block),
  );
  const coherentFontSizes = normalizeAdjacentWordFontSizes(
    contentBlocks,
    width,
    height,
  );
  const nearbyCoverTextColor = contentBlocks
    .filter((candidate) => {
      const color = candidate.font?.color;
      const size = candidate.font?.size ?? candidate.bbox.h * 0.82;
      return (
        page.number === 1 &&
        candidate.bbox.y < height * 0.32 &&
        size >= 15 &&
        Boolean(color && /^#[0-9a-f]{6}$/i.test(color)) &&
        !/^(?:#000000|#171717)$/i.test(color ?? "") &&
        !isLightColor(color!)
      );
    })
    .sort(
      (a, b) =>
        (b.font?.size ?? b.bbox.h) - (a.font?.size ?? a.bbox.h),
    )[0]?.font?.color;
  const explicitActivityPage = contentBlocks.some((block) =>
    activityHeadingPattern.test(block.text?.trim() ?? "") ||
    /^(?:look at|say what|name (?:the|these)|describe|write|answer|andika|jibu|angalia|tazama|eleza)\b/i.test(block.text?.trim() ?? ""),
  );
  const equationRows = contentBlocks.filter((block) =>
    isUnansweredEquation(block.text ?? ""),
  );
  const itemLabels = contentBlocks.filter((block) =>
    /^(?:\([a-z]\)|[a-z][.)]|\d{1,2}[.)])$/i.test(block.text?.trim() ?? ""),
  );
  const hasWorkedExampleHeading = contentBlocks.some((block) =>
    /^(?:mfano|example)(?:\s+(?:wa\s+)?\d+)?\b/i.test(
      block.text?.trim() ?? "",
    ),
  );
  const continuationActivityPage =
    !hasWorkedExampleHeading && equationRows.length >= 3 && itemLabels.length >= 3;
  const numberedQuestionLabels = contentBlocks.filter((block) =>
    /^\d{1,2}[.)]$/.test(block.text?.trim() ?? ""),
  );
  const proseQuestionPage =
    !hasWorkedExampleHeading &&
    numberedQuestionLabels.length >= 2 &&
    contentBlocks.filter((block) => /\?\s*$/.test(block.text?.trim() ?? ""))
      .length >= 2;
  const activityPage =
    explicitActivityPage || continuationActivityPage || proseQuestionPage;
  const oralOnly = rawTextBlocks.some((block) =>
    oralInstruction.test(block.text ?? ""),
  );
  const fractionRows = buildStackedFractionRows(
    contentBlocks.filter(
      (block) => !belongsToWorkedExample(block, rawTextBlocks),
    ),
    width,
    height,
  );
  const fractionComponents = new Set(
    fractionRows.flatMap((row) => row.components),
  );
  const examplePanelBounds = buildExamplePanels(
    rawTextBlocks,
    visibleAssets,
    width,
    height,
  );
  const activityPanelBounds = buildActivityPanels(
    rawTextBlocks,
    width,
    height,
    visibleAssets,
  );
  const tracingPromptBlock = contentBlocks.find((block) =>
    /\b(?:trace|join(?:ing)?\s+the\s+dots|fuatisha|unganisha\s+nukta)\b/i.test(
      block.text ?? "",
    ),
  );
  const tracingPanel = tracingPromptBlock
    ? activityPanelBounds.find((panel) => {
        const centerX = tracingPromptBlock.bbox.x + tracingPromptBlock.bbox.w / 2;
        const centerY = tracingPromptBlock.bbox.y + tracingPromptBlock.bbox.h / 2;
        return centerX >= panel.x && centerX <= panel.x + panel.w && centerY >= panel.y && centerY <= panel.y + panel.h;
      })
    : undefined;
  const tracingDigits = tracingPromptBlock && tracingPanel
    ? contentBlocks
        .filter((block) => /^\d$/.test(block.text?.trim() ?? ""))
        .filter((block) => block.bbox.y > tracingPromptBlock.bbox.y)
        .sort((a, b) => a.bbox.y - b.bbox.y)
        .slice(0, 9)
    : [];
  const tracingDigitTops = new Map<ExtractedLayoutBlock, number>();
  if (tracingPromptBlock && tracingPanel && tracingDigits.length >= 8) {
    const gridTop = Math.max(
      tracingPromptBlock.bbox.y + tracingPromptBlock.bbox.h + height * 0.012,
      tracingPanel.y + tracingPanel.h * 0.105,
    );
    const gridBottom = tracingPanel.y + tracingPanel.h - height * 0.018;
    const rowHeight = (gridBottom - gridTop) / tracingDigits.length;
    tracingDigits.forEach((block, index) =>
      tracingDigitTops.set(
        block,
        gridTop + rowHeight * (index + 0.5) - block.bbox.h / 2,
      ),
    );
  }
  const numericTable = buildSemanticNumericTablesByPanel(
    contentBlocks,
    width,
    height,
    decoration.accent,
    activityPanelBounds,
  ) ?? buildSemanticNumericTable(
    contentBlocks,
    width,
    height,
    decoration.accent,
    activityPanelBounds,
  ) ?? buildSemanticLabelResponseTable(
    contentBlocks,
    width,
    height,
    decoration.accent,
    activityPanelBounds,
  );
  const sourceWordCardPage = /\b(?:read aloud the following numbers|draw lines? to match each word)\b/i.test(
    contentBlocks.map((block) => block.text ?? "").join(" "),
  );
  const sourceWordMatchingPage = /\bdraw lines? to match each word\b/i.test(
    contentBlocks.map((block) => block.text ?? "").join(" "),
  );
  const illustratedTableLabels = contentBlocks.filter((block) =>
    /^(?:\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)$/i.test(
      block.text?.trim() ?? "",
    ),
  );
  const illustratedTableFontSize =
    visibleAssets.length >= 5 && illustratedTableLabels.length >= 8
      ? median(
          illustratedTableLabels.map(
            (block) => block.font?.size ?? block.bbox.h * .82,
          ),
        )
      : undefined;
  const illustratedTableLabelSet = new Set(illustratedTableLabels);
  // Never invent panels from generic PDF image bounds. Real page decoration
  // is retained only when it was extracted as an actual image asset.
  const semanticDecorations = "";
  // Preserve the PDF's measured line geometry. Reflowing dense pages into one
  // article made them readable, but no longer recognisable as the same book.
  const positionedText = contentBlocks
    .map((block, index) => {
      if (numericTable?.blocks.includes(block)) return "";
      if (fractionComponents.has(block)) return "";
      // Classification depends only on this block's own text/position, not
      // on its size or family, so it can safely run before either is
      // computed - which lets a cache hit below override both consistently
      // rather than only the final rendered string.
      const activityHeadingForCache =
        activityHeadingPattern.test(block.text?.trim() ?? "");
      const exampleHeadingForCache = isNumberedExampleHeading(block);
      const chapterHeadingForCache =
        /^(?:chapter|sura)\b/i.test(block.text?.trim() ?? "") &&
        block.bbox.y < height * 0.28;
      const chapterSubtitleForCache =
        !chapterHeadingForCache &&
        block.bbox.y < height * 0.3 &&
        rawTextBlocks.some(
          (candidate) =>
            /^(?:chapter|sura)\b/i.test(candidate.text?.trim() ?? "") &&
            candidate.bbox.y < block.bbox.y &&
            block.bbox.y - candidate.bbox.y < height * 0.12 &&
            Math.abs(
              (candidate.bbox.x + candidate.bbox.w / 2) -
                (block.bbox.x + block.bbox.w / 2),
            ) < width * 0.18,
        );
      const headingCacheKey =
        activityHeadingForCache || exampleHeadingForCache || chapterHeadingForCache || chapterSubtitleForCache
          ? `${activityHeadingForCache ? "activity" : exampleHeadingForCache ? "example" : chapterHeadingForCache ? "chapter" : "subtitle"}:${(block.text ?? "").trim().toLocaleLowerCase()}`
          : undefined;
      const cachedHeadingStyle = headingCacheKey
        ? canonicalHeadingStyles.get(headingCacheKey)
        : undefined;
      const size = Math.max(
        5,
        (illustratedTableFontSize && illustratedTableLabelSet.has(block)
          ? illustratedTableFontSize
          : cachedHeadingStyle?.size ??
          coherentFontSizes.get(block) ??
          block.font?.size ??
          Math.min(block.bbox.h * 0.82, 14)),
      );
      const extractedWeight = /bold|black|heavy|semibold/i.test(
        `${block.font?.weight ?? ""} ${block.font?.name ?? ""}`,
      )
        ? 700
        : 400;
      const style = /italic|oblique/i.test(
        `${block.font?.style ?? ""} ${block.font?.name ?? ""}`,
      )
        ? "italic"
        : "normal";
      const sourceColor =
        block.font?.color && /^#[0-9a-f]{6}$/i.test(block.font.color)
          ? block.font.color
          : "#171717";
      const coverDisplayColor =
        page.number === 1 &&
        size >= 22 &&
        /^(?:#000000|#171717)$/i.test(sourceColor)
          ? safeColor(nearbyCoverTextColor ?? decoration.accent)
          : sourceColor;
      const sitsOnStrongPanel =
        isLightColor(sourceColor) &&
        (page.layoutBlocks ?? []).some(
          (candidate) =>
            candidate.type === "image" &&
            candidate.bbox.w >= block.bbox.w * 1.08 &&
            candidate.bbox.h >= block.bbox.h * 1.22 &&
            boundsOverlap(candidate.bbox, block.bbox) > 0.72,
        );
      const color =
        isLightColor(coverDisplayColor) && size >= 22
          ? readableTextColor(
              safeColor(nearbyCoverTextColor ?? decoration.accent),
              pageSurface,
              3,
            )
          : sitsOnStrongPanel
            ? coverDisplayColor
            : readableTextColor(
                coverDisplayColor,
                pageSurface,
                size >= 15 ? 3 : 4.5,
              );
      const coverTitleFinish =
        page.number === 1 && size >= 22
          ? `;text-shadow:.035em .055em 0 color-mix(in srgb,${color} 52%,#111)`
          : "";
      const tag = size >= 22 ? "h1" : size >= 15 ? "h2" : "p";
      const sourceFamily = tracingDigitTops.has(block)
        ? "Arial,'Helvetica Neue',sans-serif"
        : cachedHeadingStyle?.family ?? sourceFontFamily(block.font, options.fontFamily);
      if (headingCacheKey && !cachedHeadingStyle)
        canonicalHeadingStyles.set(headingCacheKey, { size, family: sourceFamily });
      const activityHeading = activityHeadingForCache;
      const exampleHeading = exampleHeadingForCache;
      const chapterHeading = chapterHeadingForCache;
      const chapterSubtitle = chapterSubtitleForCache;
      const sourceWordCard =
        sourceWordCardPage &&
        /^(?:zero|one|two|three|four|five|six|seven|eight|nine)$/i.test(
          block.text?.trim() ?? "",
        );
      let renderedWidth = activityHeading
        ? Math.min(
            width - block.bbox.x - width * 0.055,
            Math.max(block.bbox.w, width * 0.23),
          )
        : exampleHeading
          ? Math.min(width - block.bbox.x, Math.max(block.bbox.w, width * 0.23))
          : sourceWordCard
            ? Math.max(
                block.bbox.w,
                width * (sourceWordMatchingPage ? 0.22 : 0.14),
              )
            : block.bbox.w;
      const tracingInstruction =
        /\b(?:trace|join(?:ing)?\s+the\s+dots|practi[cs]e\s+writing|copy|fuatisha|unganisha\s+nukta)\b/i.test(
          block.text ?? "",
        );
      const instructionHeadingAbove =
        /\b(?:write|read|count|fill|identify|match|choose|draw|trace|study|complete|answer|subtract|add|colour|color|copy|andika|jibu|hesabu|chagua|unganisha)\b/i.test(
          block.text ?? "",
        )
          ? contentBlocks
              .filter((candidate) =>
                activityHeadingPattern.test(candidate.text?.trim() ?? "") &&
                candidate.bbox.y <= block.bbox.y &&
                block.bbox.y - candidate.bbox.y < height * .065,
              )
              .sort((a, b) => b.bbox.y - a.bbox.y)[0]
          : undefined;
      const containingInstructionPanel =
        tracingInstruction || instructionHeadingAbove
          ? activityPanelBounds.find((panel) => {
              const centerX = block.bbox.x + block.bbox.w / 2;
              const centerY = block.bbox.y + block.bbox.h / 2;
              return (
                centerX >= panel.x &&
                centerX <= panel.x + panel.w &&
                centerY >= panel.y &&
                centerY <= panel.y + panel.h
              );
            })
          : undefined;
      const renderedLeft = sourceWordCard
        ? Math.max(
            width * 0.04,
            block.bbox.x - (renderedWidth - block.bbox.w) / 2,
          )
        : activityHeading
          ? Math.min(width - renderedWidth, block.bbox.x + width * 0.008)
        : containingInstructionPanel
        ? Math.max(block.bbox.x, containingInstructionPanel.x + width * 0.012)
        : block.bbox.x;
      if (tracingInstruction || instructionHeadingAbove) {
        renderedWidth = containingInstructionPanel
          ? Math.max(
              width * .12,
              containingInstructionPanel.x + containingInstructionPanel.w - renderedLeft - width * .025,
            )
          : Math.max(block.bbox.w, width - block.bbox.x - width * .09);
      }
      const headingAbove = instructionHeadingAbove;
      const prominentHeadingAbove = chapterSubtitle
        ? undefined
        : contentBlocks
            .filter((candidate) => {
              if (candidate === block || candidate.bbox.y >= block.bbox.y)
                return false;
              const candidateSize =
                candidate.font?.size ?? candidate.bbox.h * 0.82;
              const currentSize = block.font?.size ?? block.bbox.h * 0.82;
              const horizontalOverlap = Math.max(
                0,
                Math.min(
                  candidate.bbox.x + candidate.bbox.w,
                  block.bbox.x + block.bbox.w,
                ) - Math.max(candidate.bbox.x, block.bbox.x),
              );
              return (
                candidateSize >= currentSize * 1.16 &&
                horizontalOverlap >=
                  Math.min(candidate.bbox.w, block.bbox.w) * 0.22 &&
                block.bbox.y - (candidate.bbox.y + candidate.bbox.h) <
                  height * 0.045
              );
            })
            .sort((a, b) => b.bbox.y - a.bbox.y)[0];
      const renderedTop = tracingDigitTops.get(block) ?? (headingAbove
        ? Math.max(
            block.bbox.y,
            headingAbove.bbox.y + headingAbove.bbox.h + height * .011,
          )
        : prominentHeadingAbove
          ? Math.max(
              block.bbox.y,
              Math.min(
                block.bbox.y + height * 0.014,
                prominentHeadingAbove.bbox.y +
                  prominentHeadingAbove.bbox.h +
                  height * 0.009,
              ),
            )
        : block.bbox.y);
      // Bold glyphs render measurably wider than the same regular-weight
      // character; without this allowance a bold short word (e.g. a table
      // column header like "Fruits"/"Number") is estimated using the same
      // per-character width as thin body text, understating how much space
      // it actually needs and letting the fit ratio below say "fits" when
      // it doesn't.
      const boldWidthAllowance = extractedWeight === 700 ? 1.12 : 1;
      const estimatedTextWidth = Math.max(
        size,
        [...(block.text ?? "")].reduce(
          (total, character) =>
            total +
            size *
              boldWidthAllowance *
              (/\s/.test(character)
                ? 0.28
                : /[MW@#%]/.test(character)
                  ? 0.82
                  : /[ilI1.,'`]/.test(character)
                    ? 0.3
                    : 0.54),
          0,
        ),
      );
      const numericBlock =
        /\d/.test(block.text ?? "") &&
        /^[\d\s.,:;()\[\]+\-−×x÷=/%]+$/.test(block.text?.trim() ?? "");
      // Embedded PDF subset metadata frequently drops the intended weight.
      // Isolated primary-school numerals are display content, so retain an
      // explicit bold face and otherwise give them a semibold floor.
      const weight = numericBlock ? Math.max(700, extractedWeight) : extractedWeight;
      // activityHeading (and chapterHeading) render as a padded pill
      // (`padding:0 .56em` from headingSurface below) inside a
      // box-sizing:border-box box, so the padding eats directly into the
      // same width used here - without subtracting it, this ratio says
      // "fits" using the full box width while the real available space for
      // glyphs is narrower, letting bold badge text (e.g. "Exercise 1")
      // overflow its own pill with no shrink-fit applied.
      const headingPaddingAllowance = activityHeading ? size * 1.12 : 0;
      // chapterHeading/chapterSubtitle render inside a pill forced to a
      // fixed 68%/65% of the *page* width (see headingSurface's
      // `width:...!important` below) - not `renderedWidth`, the block's own
      // measured PDF width used for every other block's fit ratio. Using
      // `renderedWidth` here would check the fit against the wrong box
      // entirely, so these two compute the ratio against their real,
      // forced box width instead.
      const availableWidth = chapterHeading
        ? width * 0.68
        : chapterSubtitle
          ? width * 0.65
          : renderedWidth;
      const textFitRatio =
        (availableWidth - headingPaddingAllowance) / (estimatedTextWidth * 1.08);
      // PDF text boxes are sometimes narrower than their font metrics imply
      // (especially italic textbook headings). Fit every reconstructed block,
      // including activity labels and chapter titles, rather than allowing
      // it to spill into the neighbouring question, illustration, or pill.
      const horizontalScale = Math.min(1, Math.max(0.2, textFitRatio));
      const fittedSize = numericBlock
        ? size * Math.min(1, Math.max(0.42, renderedWidth / estimatedTextWidth))
        : size;
      const className = activityHeading
        ? "activity-heading"
        : exampleHeading
          ? "example-heading"
          : chapterHeading
            ? "chapter-heading"
            : chapterSubtitle
              ? "chapter-subtitle"
          : sourceWordCard
            ? "litera-source-word-card"
            : undefined;
      const insideComposedExample = composedExampleBounds.some(
        (bounds) =>
          block.bbox.x + block.bbox.w / 2 >= bounds.x &&
          block.bbox.x + block.bbox.w / 2 <= bounds.x + bounds.w &&
          block.bbox.y + block.bbox.h / 2 >= bounds.y &&
          block.bbox.y + block.bbox.h / 2 <= bounds.y + bounds.h,
      );
      const headingSurface = activityHeading
        ? `;display:flex;align-items:center;height:${boundedPercent(block.bbox.y, block.bbox.h, height)}%;padding:0 .56em;border-radius:.8em;background:${safeColor(decoration.accent)};color:#fff;box-shadow:none`
        : chapterHeading
          ? `;left:16%!important;width:68%!important;box-sizing:border-box;display:flex;align-items:center;justify-content:center;height:${boundedPercent(block.bbox.y, block.bbox.h, height)}%;padding:0;border-radius:.45em;background:${safeColor(decoration.accent)};color:#fff;text-align:center;box-shadow:0 .18em .25em rgba(0,0,0,.16)`
          : chapterSubtitle
            ? `;left:17.5%!important;width:65%!important;box-sizing:border-box;padding:.52em 0;border:.08em solid ${safeColor(decoration.accent)};border-top:0;border-radius:0 0 .5em .5em;color:${safeColor(decoration.accent)};text-align:center`
        : sourceWordCard
          ? `;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:.15em .45em;border:.08cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 20%,#b7d8d6);border-radius:.05cqw;background:color-mix(in srgb,${safeColor(decoration.accent)} 12%,#fff);box-shadow:.14cqw .19cqw .2cqw rgba(0,0,0,.3);font-weight:600`
          : "";
      const hiddenSemanticStyle = insideComposedExample
        ? "position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;"
        : "";
      return `<${tag} data-id="page-${page.number}-text-${index}" data-layout-block="${index}"${numericBlock ? ' data-numeric-layout="true"' : ""}${insideComposedExample ? ' class="composite-example-semantics"' : className ? ` class="${className}"` : ""} style="${hiddenSemanticStyle}left:${percent(renderedLeft, width)}%;top:${percent(renderedTop, height)}%;width:${boundedPercent(renderedLeft, renderedWidth, width)}%;min-height:${boundedPercent(renderedTop, block.bbox.h, height)}%;font-family:${sourceFamily};font-size:${((fittedSize / width) * 100).toFixed(3)}cqw;font-weight:${weight};font-style:${style};color:${exampleHeading ? safeColor(decoration.accent) : color}${coverTitleFinish}${horizontalScale < 0.999 ? `;transform:scaleX(${horizontalScale.toFixed(4)});transform-origin:left top` : ""}${numericBlock ? ";overflow:hidden;text-overflow:clip" : ""}${headingSurface}">${renderMathInText(block.text!)}</${tag}>`;
    })
    .join("");
  const fractionMath = fractionRows
    .map(
      (row, index) =>
        `<span class="geometry-math" data-id="page-${page.number}-fraction-${index}" data-fraction-row="${index}" data-latex="${escapeHtml(row.latex)}" style="position:absolute;z-index:3;left:${percent(row.bbox.x, width)}%;top:${percent(row.bbox.y, height)}%;width:${boundedPercent(row.bbox.x, row.bbox.w, width)}%;height:${boundedPercent(row.bbox.y, row.bbox.h, height)}%;display:flex;align-items:center;font-size:${((row.fontSize / width) * 100).toFixed(3)}cqw;line-height:1"><math aria-label="${escapeHtml(row.label)}"><mrow><mfrac><mn>${row.numerators[0]}</mn><mn>${row.denominator}</mn></mfrac><mo>+</mo><mfrac><mn>${row.numerators[1]}</mn><mn>${row.denominator}</mn></mfrac><mo>=</mo></mrow></math></span>`,
    )
    .join("");
  const text = positionedText + fractionMath;
  const inferredPanels = [...examplePanelBounds, ...activityPanelBounds];
  const extractedSourceRules = (page.layoutBlocks ?? [])
    .filter((block) => {
      if (block.type !== "image") return false;
      if (block.shape === "ellipse" || block.shape === "star")
        return (
          block.bbox.x >= width * .03 &&
          block.bbox.y >= height * .05 &&
          block.bbox.x + block.bbox.w <= width * .97 &&
          block.bbox.y + block.bbox.h <= height * .94
        );
      // Cover typography is frequently intersected by tiny vector fragments
      // from crop/registration artwork. They are not content rules and must
      // never be reconstructed behind the title.
      if (page.number === 1) return false;
      if (
        // boundsOverlap(a, b) measures the intersection as a fraction of
        // b's own area, matching the convention used elsewhere in this file
        // (the small candidate goes second) - passed the other way round,
        // the ratio was intersection-over-the-whole-table's-area, which for
        // a thin border-rule fragment along a table edge is always tiny and
        // essentially never crosses this threshold. That let genuine table
        // border rules survive and render at their raw PDF bbox, which can
        // extend past the table's own (deliberately shrunk) rendered box -
        // the reported "hanging lines" past the table's edge.
        numericTable &&
        rectanglesIntersect(
          numericTable.bounds,
          block.bbox,
          Math.max(width, height) * 0.004,
        )
      )
        return false;
      const horizontal = block.bbox.h <= Math.max(2.5, height * 0.004);
      const vertical = block.bbox.w <= Math.max(2.5, width * 0.004);
      const centerX = block.bbox.x + block.bbox.w / 2;
      const centerY = block.bbox.y + block.bbox.h / 2;
      const containingPanel = inferredPanels.find(
        (panel) =>
          centerY >= panel.y &&
          centerY <= panel.y + panel.h &&
          centerX >= panel.x &&
          centerX <= panel.x + panel.w,
      );
      if (
        horizontal &&
        containingPanel &&
        block.bbox.w < containingPanel.w * 0.08
      )
        return false;
      if (centerY < height * 0.055 || centerY > height * 0.9) return false;
      if (centerX < width * 0.035 || centerX > width * 0.965) return false;
      if (
        activityPage &&
        vertical &&
        block.bbox.x > width * 0.82 &&
        block.bbox.h > height * 0.14
      )
        return false;
      if (
        fractionRows.some(
          (row) => boundsOverlap(row.bbox, block.bbox) > 0.65,
        )
      )
        return false;
      if (
        visibleAssets.some((asset) => {
          const areaRatio =
            (asset.bounds.w * asset.bounds.h) / (width * height);
          return (
            areaRatio >= 0.001 &&
            areaRatio < 0.3 &&
            boundsOverlap(asset.bounds, block.bbox) > 0.45
          );
        })
      )
        return false;
      if (
        inferredPanels.some((panel) =>
          ruleDuplicatesPanelEdge(block.bbox, panel, width, height),
        )
      )
        return false;
      return horizontal || vertical;
    })
    .map((block, index) => {
      if (block.shape === "ellipse")
        return `<span class="source-rule source-ellipse" data-source-rule="${index}" aria-hidden="true" style="left:${percent(block.bbox.x, width)}%;top:${percent(block.bbox.y, height)}%;width:${boundedPercent(block.bbox.x, block.bbox.w, width)}%;height:${boundedPercent(block.bbox.y, block.bbox.h, height)}%;box-sizing:border-box;border:.1cqw solid ${safeColor(decoration.accent)};border-radius:50%;background:transparent"></span>`;
      if (block.shape === "star")
        return `<svg class="source-vector-star" data-source-rule="${index}" aria-hidden="true" viewBox="0 0 100 100" style="position:absolute;z-index:2;left:${percent(block.bbox.x, width)}%;top:${percent(block.bbox.y, height)}%;width:${boundedPercent(block.bbox.x, block.bbox.w, width)}%;height:${boundedPercent(block.bbox.y, block.bbox.h, height)}%;overflow:visible"><polygon points="50,3 61,36 96,36 68,56 79,91 50,70 21,91 32,56 4,36 39,36" fill="white" stroke="#d5222a" stroke-width="7" stroke-linejoin="miter"/></svg>`;
      const centerX = block.bbox.x + block.bbox.w / 2;
      const centerY = block.bbox.y + block.bbox.h / 2;
      const owner = inferredPanels.find(
        (panel) =>
          centerY >= panel.y &&
          centerY <= panel.y + panel.h &&
          centerX >= panel.x - width * 0.02 &&
          centerX <= panel.x + panel.w + width * 0.02,
      );
      const horizontal = block.bbox.h <= Math.max(2.5, height * 0.004);
      const vertical = block.bbox.w <= Math.max(2.5, width * 0.004);
      const x = owner
        ? horizontal && Math.abs(block.bbox.x - owner.x) <= width * .025
          ? owner.x
          : Math.max(block.bbox.x, owner.x)
        : block.bbox.x;
      const right = owner
        ? horizontal && Math.abs(block.bbox.x + block.bbox.w - (owner.x + owner.w)) <= width * .025
          ? owner.x + owner.w
          : Math.min(block.bbox.x + block.bbox.w, owner.x + owner.w)
        : block.bbox.x + block.bbox.w;
      const y = owner
        ? vertical && Math.abs(block.bbox.y - owner.y) <= height * .018
          ? owner.y
          : Math.max(block.bbox.y, owner.y)
        : block.bbox.y;
      const bottom = owner
        ? vertical && Math.abs(block.bbox.y + block.bbox.h - (owner.y + owner.h)) <= height * .018
          ? owner.y + owner.h
          : Math.min(block.bbox.y + block.bbox.h, owner.y + owner.h)
        : block.bbox.y + block.bbox.h;
      return `<span class="source-rule" data-source-rule="${index}" aria-hidden="true" style="left:${percent(x, width)}%;top:${percent(y, height)}%;width:${boundedPercent(x, Math.max(right - x, 1), width)}%;height:${boundedPercent(y, Math.max(bottom - y, 1), height)}%"></span>`;
    })
    .join("");
  const pageCopy = contentBlocks.map((block) => block.text ?? "").join(" ");
  const numberedDiagramRows = contentBlocks
    .filter((block) => /^[1-9][.)]$/.test(block.text?.trim() ?? ""))
    .filter((block) =>
      activityPanelBounds.length === 0 || activityPanelBounds.some(
        (panel) =>
          block.bbox.y >= panel.y &&
          block.bbox.y <= panel.y + panel.h &&
          block.bbox.x >= panel.x - width * .02 &&
          block.bbox.x <= panel.x + panel.w,
      ),
    )
    .sort((a, b) => a.bbox.y - b.bbox.y);
  const illustratedOperationCount = contentBlocks.filter((block) =>
    /^(?:add|equals|[+=])$/i.test(block.text?.trim() ?? ""),
  ).length;
  const needsPairedDiagramSlots =
    numberedDiagramRows.length >= 3 &&
    (/(?:write|find|show).{0,45}(?:total|number).{0,35}(?:objects?|diagram)/i.test(pageCopy) ||
      illustratedOperationCount >= 4);
  const needsPairedAnswerLines =
    !needsPairedDiagramSlots &&
    numberedDiagramRows.length >= 3 &&
    /write.{0,55}(?:number|answer).{0,45}(?:objects?|box|plate|tray|diagram)/i.test(pageCopy);
  // Pale vector ovals and writing rules are sometimes emitted by the PDF as
  // clipping paths rather than paint operations. They consequently have no
  // bitmap asset and no extracted rule. Reconstruct the printed response
  // geometry from the numbered rows, but only for paired diagram exercises
  // whose wording proves that those slots belong to the source page.
  const inferredDiagramSlots = needsPairedDiagramSlots
    ? numberedDiagramRows
        .flatMap((label, rowIndex) => {
          const nextTop = numberedDiagramRows[rowIndex + 1]?.bbox.y;
          const rowBottom = nextTop ?? activityPanelBounds.find(
            (panel) => label.bbox.y >= panel.y && label.bbox.y <= panel.y + panel.h,
          )?.y! + activityPanelBounds.find(
            (panel) => label.bbox.y >= panel.y && label.bbox.y <= panel.y + panel.h,
          )?.h!;
          const rowHeight = Math.max(height * .075, (rowBottom || label.bbox.y + height * .12) - label.bbox.y);
          // The source uses generous, near-1.6:1 ovals. A shallow 2.6:1
          // approximation crossed the top of eggs, stars and cups. Size the
          // response surface from its row and reserve an inset around the
          // complete artwork group instead.
          const continuedIllustratedEquation = illustratedOperationCount >= 4;
          const ovalWidth = width * (continuedIllustratedEquation ? .135 : .255);
          const rowArtwork = [
            ...visibleAssets
              .filter((asset) => !isDecorativeGeometryAsset(asset, width, height))
              .map((asset) => asset.bounds),
            ...(page.layoutBlocks ?? [])
              .filter((block) => block.shape === "star")
              .map((block) => block.bbox),
          ].filter((bounds) => {
            const centerY = bounds.y + bounds.h / 2;
            return (
              centerY >= label.bbox.y &&
              centerY < (rowBottom || label.bbox.y + rowHeight) &&
              bounds.x > width * .1 &&
              bounds.x + bounds.w < width * .9 &&
              bounds.w < width * .34 &&
              bounds.h < rowHeight * .82
            );
          });
          const artworkLeft = rowArtwork.length
            ? Math.min(...rowArtwork.map((bounds) => bounds.x))
            : undefined;
          const artworkRight = rowArtwork.length
            ? Math.max(...rowArtwork.map((bounds) => bounds.x + bounds.w))
            : undefined;
          const artworkCenter = artworkLeft !== undefined && artworkRight !== undefined
            ? (artworkLeft + artworkRight) / 2
            : undefined;
          const artworkTop = rowArtwork.length
            ? Math.min(...rowArtwork.map((bounds) => bounds.y))
            : label.bbox.y;
          const artworkBottom = rowArtwork.length
            ? Math.max(...rowArtwork.map((bounds) => bounds.y + bounds.h))
            : label.bbox.y + rowHeight * .6;
          const ovalTop = continuedIllustratedEquation
            ? Math.max(label.bbox.y - rowHeight * .01, artworkTop - height * .018)
            : label.bbox.y - rowHeight * .01;
          const ovalHeight = continuedIllustratedEquation
            ? Math.min(
                rowHeight * .92,
                Math.max(height * .145, artworkBottom - ovalTop + height * .018),
              )
            : Math.min(height * .125, rowHeight * .725);
          const occupiedX = artworkCenter === undefined
            ? width * .205
            : Math.max(width * .14, Math.min(width * .605, artworkCenter - ovalWidth / 2));
          const mirroredX = width - occupiedX - ovalWidth;
          const artworkClusters = [...rowArtwork]
            .sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2))
            .reduce<Array<Array<(typeof rowArtwork)[number]>>>((clusters, bounds) => {
              const center = bounds.x + bounds.w / 2;
              const cluster = clusters.find((items) => {
                const clusterCenter = median(items.map((item) => item.x + item.w / 2));
                return Math.abs(clusterCenter - center) <= width * .12;
              });
              if (cluster) cluster.push(bounds);
              else clusters.push([bounds]);
              return clusters;
            }, []);
          const artworkCenters = artworkClusters
            .map((items) => (Math.min(...items.map((item) => item.x)) + Math.max(...items.map((item) => item.x + item.w))) / 2)
            .filter((center) => center < width * .68)
            .slice(0, 2);
          const columns = continuedIllustratedEquation
            ? [
                (artworkCenters[0] ?? width * .235) - ovalWidth / 2,
                (artworkCenters[1] ?? width * .49) - ovalWidth / 2,
                width * .79 - ovalWidth / 2,
              ]
            : artworkCenter !== undefined && artworkCenter > width / 2
              ? [mirroredX, occupiedX]
              : [occupiedX, mirroredX];
          return columns.flatMap((x, column) => [
            `<span class="source-rule source-ellipse source-inferred-response" data-inferred-row="${rowIndex}" data-inferred-column="${column}" aria-hidden="true" style="left:${percent(x, width)}%;top:${percent(ovalTop, height)}%;width:${percent(ovalWidth, width)}%;height:${boundedPercent(ovalTop, ovalHeight, height)}%;box-sizing:border-box;border:.1cqw solid ${safeColor(decoration.accent)};border-radius:50%;background:transparent"></span>`,
            continuedIllustratedEquation
              ? ""
              : `<span class="source-rule source-inferred-underline" aria-hidden="true" style="left:${percent(x + width * .0125, width)}%;top:${percent(ovalTop + ovalHeight + height * .006, height)}%;width:23%;height:.12cqw"></span>`,
          ]);
        })
        .join("")
    : needsPairedAnswerLines
      ? numberedDiagramRows
          .flatMap((label, rowIndex) => {
            const nextTop = numberedDiagramRows[rowIndex + 1]?.bbox.y;
            const owner = activityPanelBounds.find(
              (panel) => label.bbox.y >= panel.y && label.bbox.y <= panel.y + panel.h,
            );
            const rowBottom = nextTop ?? (owner ? owner.y + owner.h : label.bbox.y + height * .12);
            const y = Math.max(label.bbox.y + height * .035, rowBottom - height * .025);
            return [width * .2, width * .61].map(
              (x, column) =>
                `<span class="source-rule source-inferred-underline" data-inferred-row="${rowIndex}" data-inferred-column="${column}" aria-hidden="true" style="left:${percent(x, width)}%;top:${percent(y, height)}%;width:23%;height:.12cqw"></span>`,
            );
          })
          .join("")
      : "";
  const sourceRules = extractedSourceRules + inferredDiagramSlots;
  const examplePanels = examplePanelBounds
    .map(
      (panel, index) =>
        `<span class="example-panel" data-example-panel="${index}" aria-hidden="true" style="left:${percent(panel.x, width)}%;top:${percent(panel.y, height)}%;width:${boundedPercent(panel.x, panel.w, width)}%;height:${boundedPercent(panel.y, panel.h, height)}%;border:.1cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 52%,#fff);border-radius:1.8cqw;background:color-mix(in srgb,${safeColor(decoration.accent)} 9%,#fff)"></span>`,
    )
    .join("");
  const activityPanels = activityPanelBounds
    .map(
      (panel, index) =>
        `<span class="activity-panel" data-activity-panel="${index}" aria-hidden="true" style="left:${percent(panel.x, width)}%;top:${percent(panel.y, height)}%;width:${boundedPercent(panel.x, panel.w, width)}%;height:${boundedPercent(panel.y, panel.h, height)}%;border:.12cqw solid ${safeColor(decoration.accent)};border-radius:1.8cqw;background:color-mix(in srgb,${safeColor(decoration.accent)} 1.5%,#fff)"></span>`,
    )
    .join("");
  const tracingActivities = buildTracingActivities(
    contentBlocks,
    activityPanelBounds,
    width,
    height,
    decoration.accent,
  );
  const gridCells: IllustrationGridCell[] = [
    ...buildActivityGridCells(visibleAssets, rawTextBlocks, width, height).map(
      (cell) => ({ ...cell }),
    ),
    ...buildIllustrationGridCells(
      visibleAssets,
      rawTextBlocks,
      width,
      height,
      options.activityPrompts,
    ),
  ];
  const illustrationChoiceCount = new Set(
    gridCells.flatMap((cell) => (cell.choiceGroup ? [cell.choiceGroup] : [])),
  ).size;
  const activityGridCells = gridCells
    .map((cell, index) => {
      const geometry = `left:${percent(cell.x, width)}%;top:${percent(cell.y, height)}%;width:${boundedPercent(cell.x, cell.w, width)}%;height:${boundedPercent(cell.y, cell.h, height)}%`;
      // Do not draw invented cards around ordinary images or table rows.
      // Grid cells are only an interaction hit-surface for a real visual
      // choice. The printed table/panel rules remain the authoritative frame.
      if (!cell.choiceGroup)
        return cell.sourceCard
          ? `<span class="source-image-group-card" data-grid-cell="${index}" aria-hidden="true" style="position:absolute;z-index:0;box-sizing:border-box;${geometry};border:.1cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 44%,#ef806d);border-radius:1.1cqw;background:#fff"></span>`
          : "";
      const feedbackId = `illustration-feedback-${cell.choiceGroup}-${cell.choiceValue}`;
      return `<label class="activity-grid-cell illustration-choice" data-grid-cell="${index}" data-question-response="${escapeHtml(cell.choiceGroup)}" style="${geometry}" aria-label="${escapeHtml(cell.choiceLabel ?? "Select this illustrated group")}"><input class="sr-only" type="radio" name="${escapeHtml(cell.choiceGroup)}" value="${cell.choiceValue}"${cell.correctValue ? ` data-correct-answer="${cell.correctValue}"` : ""} aria-describedby="${feedbackId}" onchange="document.querySelector('[data-litera-submit]').disabled=false"><span class="illustration-choice-surface" style="inset:auto;left:50%;top:calc(100% - 1.55cqw);width:2.4cqw;height:2.4cqw;transform:translateX(-50%);border-radius:999px;background:#fff" aria-hidden="true"></span><span class="answer-feedback" id="${feedbackId}" aria-live="polite"></span></label>`;
    })
    .join("");
  const semanticTables = (numericTable?.html ?? "").replaceAll(
    'autocomplete="off"',
    'autocomplete="off" oninput="document.querySelector(\'[data-litera-submit]\').disabled=false"',
  );
  const images = visibleAssets
    .map((asset) => {
      const url = imageUrls[asset.id];
      if (!url) return "";
      // Use the measured source bounds. Expanding illustrations into inferred
      // grid cells changed their size and whitespace and made the digital page
      // visibly different from the printed page.
      // PDF image matrices can extend beyond the trim box. Clamp every visual
      // to the source page before converting it to percentages so Windows and
      // WebKit do not disagree about negative/overflowing positioned boxes.
      const x = Math.max(0, Math.min(width, asset.bounds.x));
      const y = Math.max(0, Math.min(height, asset.bounds.y));
      const w = Math.max(1, Math.min(asset.bounds.w, width - x));
      const h = Math.max(1, Math.min(asset.bounds.h, height - y));
      const decorative =
        ((x <= width * 0.045 || x + w >= width * 0.955) &&
          ((w <= width * 0.16 && h >= height * 0.35) ||
            (w <= width * 0.25 && h >= height * 0.7))) ||
        ((y <= height * 0.05 || y + h >= height * 0.95) &&
          h <= height * 0.13 &&
          w >= width * 0.18) ||
        (y >= height * 0.88 && w <= width * 0.25 && h <= height * 0.1) ||
        ((x <= width * 0.08 || x + w >= width * 0.92) &&
          (y <= height * 0.08 || y + h >= height * 0.92) &&
          w <= width * 0.15 &&
          h <= height * 0.15);
      const shadingDiagram = asset.id.includes("composite-activity-diagram");
      const shadingLayer = shadingDiagram
        ? `<canvas data-litera-shading width="${Math.max(320, Math.round(w * 2))}" height="${Math.max(240, Math.round(h * 2))}" role="img" aria-label="Interactive shading layer. Draw over the printed shapes to shade your answer." style="position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair"></canvas><script>(function(){var c=document.currentScript.previousElementSibling;if(!(c instanceof HTMLCanvasElement))return;var d=false,p=function(e){var r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};var ctx=c.getContext('2d');if(!ctx)return;ctx.strokeStyle='rgba(54,139,196,.42)';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(10,c.width*.028);c.addEventListener('pointerdown',function(e){d=true;c.setPointerCapture(e.pointerId);var q=p(e);ctx.beginPath();ctx.moveTo(q.x,q.y)});c.addEventListener('pointermove',function(e){if(!d)return;var q=p(e);ctx.lineTo(q.x,q.y);ctx.stroke()});c.addEventListener('pointerup',function(){d=false});c.addEventListener('pointercancel',function(){d=false})})()</script>`
        : "";
      return `<figure${decorative ? ' aria-hidden="true"' : ""} data-asset-id="${escapeHtml(asset.id)}" style="left:${percent(x, width)}%;top:${percent(y, height)}%;width:${boundedPercent(x, w, width)}%;height:${boundedPercent(y, h, height)}%"><img src="${url}" alt="${decorative ? "" : shadingDiagram ? "Printed shapes for an interactive shading activity" : "Visual awaiting an accessibility description"}" loading="eager">${shadingLayer}${decorative || shadingDiagram ? "" : '<figcaption class="sr-only">Visual awaiting an accessibility description</figcaption>'}</figure>`;
    })
    .join("");
  // Litera keeps printed answer rules as real form controls. Thin source rules in
  // exercise regions become positioned inputs, preserving both the visual line
  // and a keyboard-accessible place to answer.
  const graphicalAnswerCandidates = (page.layoutBlocks ?? []).filter((block) => {
    const widthRatio = block.bbox.w / width;
    const heightRatio = block.bbox.h / height;
    const promptAbove = contentBlocks.some(
      (candidate) =>
        candidate.bbox.y <= block.bbox.y &&
        block.bbox.y - (candidate.bbox.y + candidate.bbox.h) < height * 0.09 &&
        /\b(?:answer|write|complete|fill|andika|jaza|kokotoa|tafuta)\b|\d\s*[+\-×x÷]/i.test(
          candidate.text ?? "",
        ),
    );
    const arithmeticBlocksAbove = contentBlocks.filter(
      (candidate) =>
        candidate.bbox.y <= block.bbox.y &&
        block.bbox.y - (candidate.bbox.y + candidate.bbox.h) <
          height * 0.115 &&
        candidate.bbox.x + candidate.bbox.w >= block.bbox.x - width * 0.025 &&
        candidate.bbox.x <= block.bbox.x + block.bbox.w + width * 0.025,
    );
    const stackedArithmeticAbove =
      arithmeticBlocksAbove.some((candidate) =>
        /^\s*[+−-]\s*\d*/.test(candidate.text ?? ""),
      ) &&
      arithmeticBlocksAbove.filter((candidate) => /\d/.test(candidate.text ?? ""))
        .length >= 2;
    const insideActivityPanel =
      activityPanelBounds.length === 0 ||
      activityPanelBounds.some((panel) => {
        const centerX = block.bbox.x + block.bbox.w / 2;
        const centerY = block.bbox.y + block.bbox.h / 2;
        return (
          centerX >= panel.x &&
          centerX <= panel.x + panel.w &&
          centerY >= panel.y &&
          centerY <= panel.y + panel.h
        );
      });
    const hasLowerParallelRule = (page.layoutBlocks ?? []).some(
      (candidate) =>
        candidate !== block &&
        candidate.type === "image" &&
        candidate.bbox.y > block.bbox.y &&
        candidate.bbox.y - block.bbox.y < height * 0.055 &&
        Math.abs(candidate.bbox.x - block.bbox.x) < width * 0.025 &&
        Math.abs(candidate.bbox.w - block.bbox.w) < width * 0.05 &&
        candidate.bbox.h / height <= 0.012,
    );
    return (
      block.type === "image" &&
      !belongsToWorkedExample(block, rawTextBlocks) &&
      widthRatio >= 0.07 &&
      widthRatio <= 0.42 &&
      heightRatio <= 0.012 &&
      block.bbox.y / height > 0.18 &&
      insideActivityPanel &&
      !hasLowerParallelRule &&
      (promptAbove || stackedArithmeticAbove)
    );
  });
  const graphicalAnswerBlocks = suppressTableGridRules(
    graphicalAnswerCandidates,
    visibleAssets,
    contentBlocks,
    width,
    height,
  );
  const textualAnswerTargets = textualAnswerBlocks.flatMap((block) => {
    const value = block.text ?? "";
    const matches = answerRuleMatches(value);
    return matches.map((match) => {
      const characterWidth = block.bbox.w / Math.max(1, value.length);
      const x = block.bbox.x + (match.index ?? 0) * characterWidth;
      return {
        type: "text" as const,
        text: value,
        confidence: 0.97,
        evidence: "printed-inline-rule",
        bbox: {
          x,
          y: block.bbox.y,
          w: Math.max(
            22,
            Math.min(
              block.bbox.x + block.bbox.w - x,
              match[0].length * characterWidth,
            ),
          ),
          h: block.bbox.h,
        },
      };
    });
  });
  const imageNumberTableTargets = oralOnly
    ? []
    : buildImageNumberTableTargets(
        visibleAssets,
        contentBlocks,
        width,
        height,
      );
  const numberedVisualTargets = buildNumberedVisualAnswerTargets({
    assets: visibleAssets.filter(
      (asset) =>
        !asset.id.includes("composite-example") &&
        !asset.id.includes("composite-activity-diagram"),
    ),
    textBlocks: contentBlocks,
    existingTargets: textualAnswerTargets,
    pageWidth: width,
    pageHeight: height,
    activityPage: activityPage && !oralOnly,
  });
  const repeatedBoxTargets = oralOnly || imageNumberTableTargets.length
    ? []
    : buildRepeatedAnswerBoxTargets({
        assets: visibleAssets,
        textBlocks: contentBlocks,
        pageWidth: width,
        pageHeight: height,
        activityPage,
      });
  const repeatedVectorBoxTargets = oralOnly || imageNumberTableTargets.length
    ? []
    : buildRepeatedVectorAnswerBoxTargets({
        layoutBlocks: page.layoutBlocks ?? [],
        textBlocks: contentBlocks,
        pageWidth: width,
        pageHeight: height,
        activityPage,
      });
  const labeledItemTargets = oralOnly
    ? []
    : buildLabeledItemAnswerTargets({
        textBlocks: contentBlocks,
        existingTargets: textualAnswerTargets,
        pageWidth: width,
        pageHeight: height,
      });
  const proseQuestionTargets = oralOnly
    ? []
    : buildProseQuestionAnswerTargets({
        textBlocks: contentBlocks,
        existingTargets: [...textualAnswerTargets, ...labeledItemTargets],
        pageWidth: width,
        pageHeight: height,
      });
  const fractionDiagramTargets = oralOnly
    ? []
    : buildFractionDiagramAnswerTargets({
        textBlocks: contentBlocks,
        assets: visibleAssets,
        existingTargets: [
          ...textualAnswerTargets,
          ...labeledItemTargets,
          ...proseQuestionTargets,
        ],
        pageWidth: width,
        pageHeight: height,
      });
  const equationAnswerTargets = activityPage
    ? contentBlocks
        .filter(
          (block) =>
            isUnansweredEquation(block.text ?? "") &&
            !belongsToWorkedExample(block, rawTextBlocks),
        )
        .map((block) => ({
          type: "text" as const,
          text: block.text ?? "=",
          confidence: 0.98,
          evidence: "equation-equals-anchor",
          correctAnswer: inferStackedFractionSumAnswer(
            block,
            contentBlocks,
            width,
            height,
          ) ?? inferCorrectAnswers(block.text ?? "")[0],
          bbox: {
            x: Math.min(
              width * 0.9,
              block.bbox.x + block.bbox.w + width * 0.008,
            ),
            y: block.bbox.y,
            w: Math.max(
              width * 0.055,
              Math.min(
                width * 0.1,
                width - block.bbox.x - block.bbox.w - width * 0.025,
              ),
            ),
            h: block.bbox.h,
          },
        }))
    : [];
  const stackedCellTargets = oralOnly
    ? []
    : buildStackedArithmeticCellTargets(
        contentBlocks,
        page.layoutBlocks ?? [],
        width,
        height,
      );
  const illustratedEquationTable =
    graphicalAnswerBlocks.length >= 2 &&
    contentBlocks.some((block) => /^(?:add|equals|[+=])$/i.test(block.text?.trim() ?? ""));
  const illustratedOperationTable =
    illustratedEquationTable ||
    (visibleAssets.length >= 3 &&
      repeatedBoxTargets.length + repeatedVectorBoxTargets.length > 0 &&
      /\b(?:take\s+away|remain|subtract|minus)\b/i.test(
        contentBlocks.map((block) => block.text ?? "").join(" "),
      ));
  const rawAnswerTargets = [
    ...textualAnswerTargets,
    ...imageNumberTableTargets,
    ...(oralOnly || imageNumberTableTargets.length > 0 || repeatedBoxTargets.length > 0 || repeatedVectorBoxTargets.length > 0 || stackedCellTargets.length >= 4
      ? []
      : graphicalAnswerBlocks.map((block) => ({
          ...block,
          text: undefined,
          confidence: 0.9,
          evidence: "printed-writing-rule",
        }))),
    ...(illustratedOperationTable ? [] : numberedVisualTargets.map((target) => ({
      ...target,
      confidence: 0.72,
      evidence: "semantically-aligned-whitespace",
    }))),
    ...repeatedBoxTargets,
    ...repeatedVectorBoxTargets,
    ...labeledItemTargets,
    ...(illustratedOperationTable ? [] : proseQuestionTargets),
    ...(illustratedOperationTable ? [] : fractionDiagramTargets),
    ...(illustratedOperationTable ? [] : equationAnswerTargets),
    ...(illustratedOperationTable ? [] : stackedCellTargets),
  ];
  const answerTargets = alignRepeatedAnswerBoxesToLabels(
    validateAnswerTargets(
      rawAnswerTargets,
      contentBlocks,
      visibleAssets,
      width,
      height,
      activityPanelBounds,
    ),
    contentBlocks,
    height,
  ).filter(
    (target) => !numericTable || boundsOverlap(target.bbox, numericTable.bounds) < 0.18,
  ).sort((a, b) =>
    Math.abs(a.bbox.y - b.bbox.y) <= height * 0.018
      ? a.bbox.x - b.bbox.x
      : a.bbox.y - b.bbox.y,
  );
  const denseProseTargets = answerTargets.filter(
    (target) => target.evidence === "numbered-prose-question",
  );
  const useDenseQuestionFlow = denseProseTargets.length >= 3;
  const inlineAnswerTargets = useDenseQuestionFlow
    ? answerTargets.filter((target) => target.evidence !== "numbered-prose-question")
    : answerTargets;
  const replacedAnswerVisualIds = visibleAssets
    .filter((asset) => {
      if (asset.bounds.w > width * 0.45 || asset.bounds.h > height * 0.085)
        return false;
      return inlineAnswerTargets.some((target) => {
        if (target.evidence !== "repeated-printed-answer-box") return false;
        const overlap = boundsOverlap(asset.bounds, target.bbox);
        const centerX = target.bbox.x + target.bbox.w / 2;
        const centerY = target.bbox.y + target.bbox.h / 2;
        return overlap >= 0.72 || (
          rectangleIoU(asset.bounds, target.bbox) >= .64 &&
          centerX >= asset.bounds.x &&
          centerX <= asset.bounds.x + asset.bounds.w &&
          centerY >= asset.bounds.y &&
          centerY <= asset.bounds.y + asset.bounds.h
        );
      });
    })
    .map((asset) => asset.id);
  const answerVisualReplacementStyle = replacedAnswerVisualIds.length
    ? `<style data-litera-answer-visual-replacement>${replacedAnswerVisualIds
        .map((id) => `main.litera-activity-playing figure[data-asset-id="${escapeHtml(id)}"]{visibility:hidden}`)
        .join("")}</style>`
    : "";
  const accessibleFeedbackStyle = `<style data-litera-answer-feedback-style>.answer-feedback{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style>`;
  // Interactive controls now live on a dedicated activity surface. Keep the
  // printed storyboard at its original aspect ratio instead of stretching
  // tracing and dense-question pages beyond the source page height.
  const expandableActivityStyle = "";
  const strictLayoutStyle = `<style data-litera-strict-layout>[data-layout-block]{max-width:100%!important;overflow:visible!important;text-overflow:clip}[data-numeric-layout="true"]{font-family:'Arial Black',Arial,'Helvetica Neue',sans-serif!important;font-size:max(2cqw,1.05rem)!important;font-weight:900!important;line-height:1!important}.source-data-table,.source-data-table tr,.source-data-table td{box-sizing:border-box;min-width:0;min-height:0;overflow:hidden}.source-data-table{border-style:solid!important;border-collapse:collapse!important}.source-data-table tr:first-child td{border-top-style:solid!important}.source-data-table tr:last-child td{border-bottom-style:solid!important}.source-data-table td:first-child{border-left-style:solid!important}.source-data-table td:last-child{border-right-style:solid!important}.source-data-table td>img{display:block;width:100%;height:100%;object-fit:contain}.source-answer-line,figure{max-width:100%;max-height:100%;overflow:hidden}${expandableActivityStyle}</style>`;
  const naturalAnswerStyle = `<style data-litera-answer-style>.source-answer-line input{border:0;border-bottom:.11cqw solid #696969;border-radius:0;background:transparent;color:#171717;padding:0 .12cqw;font-weight:600;box-shadow:none}.source-answer-line input[inputmode=numeric],.source-answer-line input[inputmode=decimal]{font-family:Arial,'Helvetica Neue',sans-serif!important;font-size:max(1.75cqw,1rem)!important;font-weight:800!important;line-height:1!important}.source-answer-line[data-placement-evidence="numbered-prose-question"] input{border:.09cqw solid #666;border-radius:.06cqw;background:rgba(255,255,255,.38)}.source-answer-line[data-placement-evidence*="answer-box"] input{border:.1cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 72%,#565656);border-radius:.08cqw;background:color-mix(in srgb,${safeColor(decoration.accent)} 11%,#fff);padding:0 .08cqw;box-shadow:.15cqw .2cqw .22cqw rgba(0,0,0,.28)}.source-answer-line input:hover{background:rgba(255,255,255,.5)}.source-answer-line input:focus{border-color:${safeColor(decoration.accent)};background:rgba(255,255,255,.88);box-shadow:0 0 0 .12cqw color-mix(in srgb,${safeColor(decoration.accent)} 26%,transparent)}.source-answer-line input[data-answer-state="correct"]{border-color:#16803c;background:rgba(239,252,243,.72)}.source-answer-line input[data-answer-state="incorrect"]{border-color:#b42318;background:rgba(255,243,241,.72)}</style>`;
  const answerLines = strictLayoutStyle + naturalAnswerStyle + answerVisualReplacementStyle + accessibleFeedbackStyle + inlineAnswerTargets
    .map((block, index) => {
      const textRule = block.type === "text";
      // Sit on the printed answer baseline instead of covering the equation
      // row above or the next row below it.
      const controlTop = block.bbox.y + Math.min(2, block.bbox.h * 0.08);
      const compactLabeledItem = block.evidence === "labelled-question-item";
      const compactProseQuestion = block.evidence === "numbered-prose-question";
      const controlHeight = compactLabeledItem
        ? Math.max(6, Math.min(9, block.bbox.h * 1.1))
        : compactProseQuestion
        ? Math.max(4, Math.min(7, block.bbox.h))
        : textRule
        ? Math.max(14, Math.min(22, block.bbox.h * 1.12))
        : Math.max(14, Math.min(22, block.bbox.h));
      const nearbyPrompt = contentBlocks
        .filter(
          (candidate) =>
            candidate.bbox.y <= block.bbox.y &&
            block.bbox.y - candidate.bbox.y < height * 0.18,
        )
        .sort(
          (a, b) =>
            Math.abs(block.bbox.x - a.bbox.x) -
              Math.abs(block.bbox.x - b.bbox.x) || b.bbox.y - a.bbox.y,
        )[0]?.text;
      const rowPrompt = contentBlocks
        .filter((candidate) => {
          const candidateCenter = candidate.bbox.y + candidate.bbox.h / 2;
          const targetCenter = block.bbox.y + block.bbox.h / 2;
          return (
            Math.abs(candidateCenter - targetCenter) < height * .026 &&
            candidate.bbox.x < block.bbox.x + block.bbox.w + width * .025
          );
        })
        .sort((a, b) => a.bbox.x - b.bbox.x)
        .map((candidate) => candidate.text?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      const geometricAnswer =
        "correctAnswer" in block && typeof block.correctAnswer === "string"
          ? block.correctAnswer
          : undefined;
      const correctAnswer =
        geometricAnswer ??
        (rowPrompt ? inferCorrectAnswers(rowPrompt)[0] : undefined) ??
        (nearbyPrompt ? inferCorrectAnswers(nearbyPrompt)[0] : undefined);
      const normalizedRect = [
        block.bbox.x / width,
        block.bbox.y / height,
        block.bbox.w / width,
        controlHeight / height,
      ]
        .map((value) => Math.max(0, Math.min(1, value)).toFixed(5))
        .join(",");
      return `<label class="source-answer-line" data-question-response="${index + 1}" data-placement-confidence="${block.confidence.toFixed(2)}" data-placement-evidence="${block.evidence}" data-placement-review="${block.confidence < 0.85}" data-normalized-rect="${normalizedRect}" style="left:${percent(block.bbox.x, width)}%;top:${percent(controlTop, height)}%;width:${boundedPercent(block.bbox.x, block.bbox.w, width)}%;height:${Math.max(compactLabeledItem ? 0.65 : compactProseQuestion ? 1.7 : 1.7, Number(boundedPercent(controlTop, controlHeight, height)))}%"><span class="sr-only">Answer ${index + 1}</span><input type="text"${textRule ? "" : ' inputmode="decimal"'}${correctAnswer ? ` data-correct-answer="${escapeHtml(correctAnswer)}"` : ""} autocomplete="off" aria-label="Answer ${index + 1}" aria-describedby="answer-feedback-${index + 1}"><span class="answer-feedback" id="answer-feedback-${index + 1}" aria-live="polite"></span></label>`;
    })
    .join("");
  const submitLabel = localizedSubmitLabel(
    contentBlocks.map((block) => block.text ?? "").join(" "),
  );
  const flowTop = useDenseQuestionFlow
    ? Math.max(0, Math.min(...denseProseTargets.map((target) => target.bbox.y)) - height * 0.085)
    : 0;
  const denseQuestionFlow = useDenseQuestionFlow
    ? `<section class="dense-question-flow" aria-label="Detected written activities" style="top:${percent(flowTop,height)}%;background:${pageSurface}">${denseProseTargets.map((target,index) => { const answer = "correctAnswer" in target && typeof target.correctAnswer === "string" ? target.correctAnswer : inferCorrectAnswers(target.text ?? "")[0]; const questionNumber = inlineAnswerTargets.length + index + 1; return `<div class="dense-question"><p>${renderMathInText(escapeHtml((target.text ?? `Question ${index + 1}`).replace(/\u0007/g," ").replace(/\s+/g," ").trim()))}</p><label><span class="sr-only">Answer ${questionNumber}</span><input type="text" inputmode="decimal" oninput="document.querySelector('[data-litera-submit]').disabled=false"${answer ? ` data-correct-answer="${escapeHtml(answer)}"` : ""} autocomplete="off" aria-label="Answer ${questionNumber}" aria-describedby="answer-feedback-${questionNumber}"><span class="answer-feedback" id="answer-feedback-${questionNumber}" aria-live="polite"></span></label></div>`; }).join("")}<button class="litera-submit-answers" type="button" data-litera-submit disabled>${escapeHtml(submitLabel)}</button></section>`
    : "";
  const answerSubmit = (answerTargets.length || illustrationChoiceCount || numericTable?.answerCount) && !useDenseQuestionFlow
    ? `<button class="litera-submit-answers" type="button" data-litera-submit disabled>${escapeHtml(submitLabel)}</button>`
    : "";
  const font = escapeHtml(options.fontFamily || "Arial, sans-serif");
  const background =
    gradientStops.length > 1
      ? `linear-gradient(${decoration.gradientAngle ?? 180}deg,${gradientStops
          .map(
            (stop, index) =>
              `${stop} ${((index / (gradientStops.length - 1)) * 100).toFixed(1)}%`,
          )
          .join(",")})`
      : (gradientStops[0] ?? "#ffffff");
  const folio = renderSourceFolio(page, width, height, options, pageSurface);
  const prepressCleanup = "";
  const toc = options.tocEntries
    ? renderTableOfContents(options.tocEntries, options.tocTitle, page, width, height)
    : "";
  const sourcePage = options.sourcePageUrl
    ? `<img class="source-page-facsimile" src="${options.sourcePageUrl}" alt="" aria-hidden="true">`
    : "";
  const sourceMode = Boolean(options.sourcePageUrl);
  const pageClasses = [
    activityPage ? `activity-page page-${page.number % 2 ? "odd" : "even"}` : "",
    useDenseQuestionFlow ? "dense-activity-page" : "",
    tracingActivities.html ? "trace-activity-page" : "",
  ].filter(Boolean).join(" ");
  const pageClass = pageClasses ? ` class="${pageClasses}"` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;min-height:100%;background:#e9eaec}body{display:flex;justify-content:center;align-items:flex-start;overflow-x:hidden}main[data-litera-page]{container-type:inline-size;width:100%;max-width:none;aspect-ratio:${width}/${height};position:relative;overflow:hidden;background:${background};background-color:${pageSurface};color:#171717;font-family:${font}}main.dense-activity-page{overflow-y:auto}.dense-question-flow{position:absolute;z-index:10;left:8%;width:84%;box-sizing:border-box;padding:2.2cqw 2.8cqw 4cqw;display:flex;flex-direction:column;gap:2.2cqw;box-shadow:0 -1cqw 1.5cqw ${pageSurface}}.dense-question{display:flex;flex-direction:column;gap:.8cqw}.dense-question p{margin:0;font:500 1.7cqw/1.45 ${font}}.dense-question label{display:block;position:relative}.dense-question input{box-sizing:border-box;width:72%;min-height:4.8cqw;padding:.7cqw 1cqw;border:.12cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 48%,#777);border-radius:.65cqw;background:#fff;color:#171717;font:600 1.55cqw/1.2 ${font};outline:none}.dense-question input:focus{border-color:${safeColor(decoration.accent)};box-shadow:0 0 0 .25cqw color-mix(in srgb,${safeColor(decoration.accent)} 25%,transparent)}.dense-question-flow .litera-submit-answers{position:static;align-self:flex-end;margin-top:1cqw}[data-layout-block],figure,.semantic-decoration,.source-answer-line,.source-rule,.activity-grid-cell,.example-panel,.activity-panel{position:absolute;margin:0;box-sizing:border-box}[data-layout-block]{z-index:2;overflow:visible;white-space:nowrap;overflow-wrap:normal;line-height:1;${sourceMode ? "color:transparent!important;text-shadow:none!important" : ""}}.activity-heading{z-index:3!important;border-radius:.35em;background:color-mix(in srgb,${safeColor(decoration.accent)} 22%,#fff)}.activity-panel{z-index:0;border:.1cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 48%,#fff);background:color-mix(in srgb,${safeColor(decoration.accent)} 7%,#fff)}.example-panel,.activity-grid-cell{z-index:0}.illustration-choice{z-index:5!important;cursor:pointer}.illustration-choice-surface{position:absolute;inset:0;box-sizing:border-box;border:.09cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 35%,#ef806d);border-radius:1.2cqw;background:rgba(255,255,255,.08);transition:border-color .16s,box-shadow .16s,background .16s}.illustration-choice:hover .illustration-choice-surface{background:color-mix(in srgb,${safeColor(decoration.accent)} 5%,transparent)}.illustration-choice input:focus-visible+.illustration-choice-surface{box-shadow:0 0 0 .22cqw color-mix(in srgb,${safeColor(decoration.accent)} 35%,transparent)}.illustration-choice input:checked+.illustration-choice-surface{border-color:${safeColor(decoration.accent)};box-shadow:inset 0 0 0 .2cqw ${safeColor(decoration.accent)};background:color-mix(in srgb,${safeColor(decoration.accent)} 9%,transparent)}.illustration-choice input[data-answer-state="correct"]+.illustration-choice-surface{border-color:#16803c;box-shadow:inset 0 0 0 .2cqw #16803c}.illustration-choice input[data-answer-state="incorrect"]+.illustration-choice-surface{border-color:#b42318;box-shadow:inset 0 0 0 .2cqw #b42318}.source-rule{z-index:1;display:block;min-width:1px;min-height:1px;background:${safeColor(decoration.accent)}}.litera-math{display:inline-block}.litera-math math{font-size:1.08em}.semantic-decoration{z-index:0;border:0}.semantic-decoration--strong,.semantic-decoration--wash{background:transparent}figure{z-index:1;overflow:visible}.reading-flow{position:absolute;z-index:2;overflow:hidden;line-height:1.45;overflow-wrap:anywhere}figure img{display:block;width:100%;height:100%;object-fit:contain}.source-answer-line{z-index:5}.source-answer-line input{box-sizing:border-box;width:100%;height:100%;border:0;border-bottom:.16cqw solid #555;background:rgba(255,255,255,.94);color:#171717;font:600 1.45cqw/1.2 ${font};text-align:center;outline:none}.source-answer-line input:focus{border-bottom-color:${safeColor(decoration.accent)};background:#fff}.source-answer-line input[data-answer-state="correct"]{border-bottom-color:#16803c;background:#effcf3}.source-answer-line input[data-answer-state="incorrect"]{border-bottom-color:#b42318;background:#fff3f1}.answer-feedback{position:absolute;top:100%;left:0;min-width:max-content;font:700 1.05cqw/1.3 ${font}}.litera-submit-answers{position:absolute;z-index:12;right:4%;bottom:2.4%;min-width:18%;padding:.75cqw 1.5cqw;border:0;border-radius:999px;background:${safeColor(decoration.accent)};color:#fff;font:700 1.35cqw/1 ${font}}.source-folio{position:absolute;z-index:8;display:flex;align-items:center;box-sizing:border-box;white-space:nowrap}.digital-toc{position:absolute;z-index:3;display:flex;min-height:0;flex-direction:column}.digital-toc h1{margin:0;line-height:1.1}.digital-toc ol{min-height:0;margin:0;padding:0;display:flex;flex-direction:column;list-style:none}.digital-toc li{display:grid;grid-template-columns:auto 1fr auto;align-items:end;min-width:0}.digital-toc .dots{min-width:1rem;border-bottom:.16cqw dotted currentColor;transform:translateY(-.35cqw);opacity:.65}.digital-toc a{display:contents;color:inherit;text-decoration:none}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style></head><body><main${pageClass} data-litera-page aria-label="Accessible book page ${options.digitalPageNumber ?? page.number}">${toc || `${sourcePage}${sourceMode ? "" : semanticDecorations}${sourceRules}${examplePanels}${activityPanels}${activityGridCells}${text}${sourceMode ? "" : images}${answerLines}${tracingActivities.html}${denseQuestionFlow}${answerSubmit}${semanticTables}`}${sourceMode ? "" : prepressCleanup}${sourceMode ? "" : folio}</main>${tracingActivities.runtime}<script>(function(){var submit=document.querySelector('[data-litera-submit]');var inputs=Array.from(document.querySelectorAll('.source-answer-line input,.dense-question input,.illustration-choice input'));var clean=function(value){return value.normalize('NFKC').toLocaleLowerCase().replace(/[ ,]/g,'').trim()};var answered=function(input){return input.type==='radio'?input.checked:Boolean(input.value.trim())};var update=function(){if(submit)submit.disabled=!inputs.some(answered)};document.addEventListener('input',function(event){var input=event.target;if(!(input instanceof HTMLInputElement))return;delete input.dataset.answerState;input.removeAttribute('aria-invalid');var feedback=document.getElementById(input.getAttribute('aria-describedby')||'');if(feedback)feedback.textContent='';update()});if(submit)submit.addEventListener('click',function(){var correctCount=0,incorrectCount=0;inputs.forEach(function(input){if(!answered(input)||!input.dataset.correctAnswer)return;var correct=clean(input.value)===clean(input.dataset.correctAnswer);input.dataset.answerState=correct?'correct':'incorrect';if(correct)correctCount++;else incorrectCount++;var feedback=document.getElementById(input.getAttribute('aria-describedby')||'');if(feedback)feedback.textContent=correct?'Correct - well done!':'Not correct yet - try again.'});parent.postMessage({type:'litera-answer-feedback',correct:correctCount,incorrect:incorrectCount,checked:correctCount+incorrectCount},'*')});update()})()</script></body></html>`;
}

/** Returns source visual IDs that a rendered page silently omitted. The
 * comparison is deliberately independent of DOM APIs so it can run in engine
 * regressions and before an iframe is mounted. */
export function missingStoryboardAssetIds(
  html: string,
  assets: ExtractedPageAsset[],
) {
  const rendered = new Set(
    [...html.matchAll(/\bdata-asset-id=(?:"([^"]+)"|'([^']+)')/g)].map(
      (match) => match[1] ?? match[2] ?? "",
    ),
  );
  return assets
    .map((asset) => asset.id)
    .filter((id) => id && !rendered.has(id));
}

function buildTracingActivities(
  blocks: ExtractedLayoutBlock[],
  panels: Array<{ x: number; y: number; w: number; h: number }>,
  pageWidth: number,
  pageHeight: number,
  accent: string,
) {
  const prompts = blocks.filter((block) =>
    /\b(?:trace|join(?:ing)?\s+the\s+dots|practi[cs]e\s+writing|copy|fuatisha|unganisha\s+nukta)\b/i.test(
      block.text ?? "",
    ),
  );
  if (!prompts.length) return { html: "", runtime: "" };
  const words: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  };
  const fields = prompts.flatMap((prompt, promptIndex) => {
    const text = prompt.text ?? "";
    const panel = panels.find((candidate) => {
      const centerX = prompt.bbox.x + prompt.bbox.w / 2;
      const centerY = prompt.bbox.y + prompt.bbox.h / 2;
      return centerX >= candidate.x && centerX <= candidate.x + candidate.w && centerY >= candidate.y && centerY <= candidate.y + candidate.h;
    }) ?? { x: prompt.bbox.x, y: prompt.bbox.y, w: Math.min(pageWidth - prompt.bbox.x, pageWidth * .82), h: pageHeight * .14 };

    // Some pages print each traced digit as its own separate text block, one
    // per row - with the dotted trace guide occupying the rest of that row
    // to the digit's right - rather than embedding the digits in the
    // instruction heading's own text (a plain "Trace the following numbers
    // by joining the dots." heading never does; the digits are 1-9 blocks
    // elsewhere on the page). The old logic only ever looked at the
    // heading's own text and silently produced one empty-target canvas when
    // it found nothing there. Prefer these real, per-row digit blocks when
    // present: one canvas per printed row, spanning from just after the
    // digit to the panel's right edge, instead of a single synthetic strip.
    const digitBlocks = blocks
      .filter((block) => {
        if (block === prompt || block.type !== "text") return false;
        const value = (block.text ?? "").trim();
        const isDigit = /^\d{1,2}$/.test(value);
        const isWord = Object.keys(words).some((word) => new RegExp(`^${word}$`, "i").test(value));
        if (!isDigit && !isWord) return false;
        const centerX = block.bbox.x + block.bbox.w / 2;
        const centerY = block.bbox.y + block.bbox.h / 2;
        return (
          centerX >= panel.x && centerX <= panel.x + panel.w &&
          centerY >= panel.y && centerY <= panel.y + panel.h &&
          block.bbox.y >= prompt.bbox.y
        );
      })
      .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

    if (digitBlocks.length >= 2) {
      const gridTop = Math.max(
        prompt.bbox.y + prompt.bbox.h + pageHeight * .012,
        panel.y + panel.h * .105,
      );
      const gridBottom = panel.y + panel.h - pageHeight * .018;
      const rowHeight = (gridBottom - gridTop) / digitBlocks.length;
      const fieldLeft = panel.x + panel.w * .255;
      const fieldWidth = panel.w * .715;
      return digitBlocks.map((block, index) => {
        const value = block.text!.trim();
        const symbol = /^\d+$/.test(value) ? value : words[value.toLowerCase()] ?? value;
        const x = fieldLeft;
        const width = fieldWidth;
        const rowTop = gridTop + rowHeight * index;
        const padding = Math.min(rowHeight * .055, pageHeight * .004);
        const top = rowTop + padding;
        const height = Math.max(pageHeight * .025, rowHeight - padding * 2);
        return `<div class="litera-trace-field" data-activity-item="trace-${promptIndex}-${index}" style="position:absolute;z-index:9;left:${percent(x,pageWidth)}%;top:${percent(top,pageHeight)}%;width:${boundedPercent(x,width,pageWidth)}%;height:${boundedPercent(top,height,pageHeight)}%"><svg aria-hidden="true" viewBox="0 0 600 200" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">${[16.667, 50, 83.333].map((xPosition) => `<text x="${xPosition}%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="none" stroke="#8b8f94" stroke-width="5" stroke-dasharray="8 9" font-family="'Sassoon Primary','Comic Sans MS',sans-serif" font-size="150" font-weight="700">${escapeHtml(symbol)}</text>`).join("")}</svg><canvas data-litera-trace-canvas data-trace-target="${escapeHtml(symbol)}" data-trace-repeat="3" width="600" height="200" aria-label="Trace ${escapeHtml(symbol)} three times" style="position:relative;display:block;width:100%;height:100%;touch-action:none;background:transparent;cursor:crosshair"></canvas><span class="sr-only" data-litera-drawing-feedback role="status" aria-live="polite"></span></div>`;
      });
    }

    const named = Object.entries(words).find(([word]) => new RegExp(`\\b${word}\\b`, "i").test(text))?.[1];
    const explicit = [...text.matchAll(/\b\d\b/g)].map((match) => match[0]);
    const symbols = named ? Array(5).fill(named) : explicit.length ? explicit : [""];
    const leftInset = named ? panel.w * .23 : panel.w * .04;
    const gap = panel.w * .012;
    const available = Math.max(pageWidth * .18, panel.w - leftInset - panel.w * .04);
    const cellWidth = Math.min(pageWidth * .13, (available - gap * (symbols.length - 1)) / symbols.length);
    const top = Math.min(panel.y + panel.h - pageHeight * .07, prompt.bbox.y + prompt.bbox.h + pageHeight * .008);
    const cellHeight = Math.max(pageHeight * .055, Math.min(pageHeight * .085, panel.y + panel.h - top - pageHeight * .008));
    return symbols.map((symbol, index) => {
      const x = panel.x + leftInset + index * (cellWidth + gap);
      return `<div class="litera-trace-field" data-activity-item="trace-${promptIndex}-${index}" style="position:absolute;z-index:9;left:${percent(x,pageWidth)}%;top:${percent(top,pageHeight)}%;width:${boundedPercent(x,cellWidth,pageWidth)}%;height:${boundedPercent(top,cellHeight,pageHeight)}%"><svg aria-hidden="true" viewBox="0 0 360 420" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="none" stroke="#8b8f94" stroke-width="8" stroke-dasharray="10 12" font-family="'Sassoon Primary','Comic Sans MS',sans-serif" font-size="280" font-weight="700">${escapeHtml(symbol)}</text></svg><canvas data-litera-trace-canvas data-trace-target="${escapeHtml(symbol)}" width="360" height="420" aria-label="Trace ${escapeHtml(symbol || "the printed guide")}" style="position:relative;display:block;width:100%;height:100%;touch-action:none;background:transparent;cursor:crosshair"></canvas><span class="sr-only" data-litera-drawing-feedback role="status" aria-live="polite"></span></div>`;
    });
  }).join("");
  const controls = `<div data-litera-trace-controls style="position:absolute;z-index:11;right:8%;top:88.6%;display:flex;align-items:center;gap:.42cqw"><button type="button" data-litera-clear-drawing style="box-sizing:border-box;border:.09cqw solid ${safeColor(accent)};border-radius:999px;background:#fff;color:#171717;padding:.38cqw .72cqw;font:600 1.18cqw/1 Arial,sans-serif;white-space:nowrap">Clear</button><button type="button" data-litera-check-drawing style="box-sizing:border-box;border:.09cqw solid ${safeColor(accent)};border-radius:999px;background:${safeColor(accent)};color:#fff;padding:.38cqw .72cqw;font:600 1.18cqw/1 Arial,sans-serif;white-space:nowrap">Check</button></div>`;
  const runtime = `<script data-litera-trace-runtime>(function(){var canvases=Array.from(document.querySelectorAll('[data-litera-trace-canvas]'));if(!canvases.length)return;canvases.forEach(function(canvas){var context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;var symbol=canvas.dataset.traceTarget||'',repeat=Math.max(1,Number(canvas.dataset.traceRepeat||1)),guide=document.createElement('canvas');guide.width=canvas.width;guide.height=canvas.height;var guideContext=guide.getContext('2d',{willReadFrequently:true});if(!guideContext)return;guideContext.strokeStyle='#111';guideContext.lineWidth=repeat>1?10:18;guideContext.font='bold '+Math.floor(Math.min(guide.width/repeat,guide.height)*.72)+'px Arial';guideContext.textAlign='center';guideContext.textBaseline='middle';if(symbol)for(var copy=0;copy<repeat;copy++)guideContext.strokeText(symbol,guide.width*(copy+.5)/repeat,guide.height/2);context.lineWidth=16;context.lineCap='round';context.lineJoin='round';context.strokeStyle='#172554';var drawing=false,point=function(event){var rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}};canvas.addEventListener('pointerdown',function(event){drawing=true;canvas.setPointerCapture(event.pointerId);var p=point(event);context.beginPath();context.moveTo(p.x,p.y)});canvas.addEventListener('pointermove',function(event){if(!drawing)return;var p=point(event);context.lineTo(p.x,p.y);context.stroke()});canvas.addEventListener('pointerup',function(){drawing=false});canvas.addEventListener('pointercancel',function(){drawing=false});canvas._literaClear=function(){context.clearRect(0,0,canvas.width,canvas.height)};canvas._literaScore=function(){var ink=context.getImageData(0,0,canvas.width,canvas.height).data,target=guideContext.getImageData(0,0,guide.width,guide.height).data,w=canvas.width,h=canvas.height,radius=16,near=function(data,x,y){for(var yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy+=4)for(var xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx+=4)if(data[(yy*w+xx)*4+3]>40)return true;return false},coverage=0,guideCount=0,precision=0,inkCount=0;for(var y=0;y<h;y+=4)for(var x=0;x<w;x+=4){var offset=(y*w+x)*4;if(target[offset+3]>40){guideCount++;if(near(ink,x,y))coverage++}if(ink[offset+3]>40){inkCount++;if(near(target,x,y))precision++}}if(!symbol)return inkCount>20?1:0;return .72*(coverage/Math.max(1,guideCount))+.28*(precision/Math.max(1,inkCount))};});var clear=document.querySelector('[data-litera-clear-drawing]'),check=document.querySelector('[data-litera-check-drawing]');if(clear)clear.addEventListener('click',function(){canvases.forEach(function(canvas){canvas._literaClear()})});if(check)check.addEventListener('click',function(){var completed=0;canvases.forEach(function(canvas){var score=canvas._literaScore(),passed=score>=.56,field=canvas.closest('[data-activity-item]');if(passed)completed++;if(field){field.dataset.answerState=passed?'correct':'incorrect';var status=field.querySelector('[data-litera-drawing-feedback]');if(status)status.textContent=passed?'Good tracing.':'Follow every dotted guide more closely.'}});window.parent.postMessage({type:'litera-answer-feedback',correct:completed,incorrect:canvases.length-completed,checked:canvases.length},'*')})})()</script>`;
  return { html: `<section data-litera-tracing-activity aria-label="Interactive tracing activity">${fields}${controls}</section>`, runtime };
}

function localizedSubmitLabel(text: string) {
  if (/\b(?:answer|question|exercise|activity|draw|write|match|count|fill|select|choose)\b/i.test(text))
    return "Submit answers";
  if (/\b(?:andika|jibu|swali|sehemu|kivuli|zoezi|shughuli)\b/i.test(text))
    return "Wasilisha majibu";
  if (/\b(?:réponse|question|exercice)\b/i.test(text)) return "Soumettre les réponses";
  if (/\b(?:respuesta|pregunta|ejercicio)\b/i.test(text)) return "Enviar respuestas";
  if (/\b(?:antwort|frage|übung)\b/i.test(text)) return "Antworten senden";
  if (/\b(?:resposta|pergunta|exercício)\b/i.test(text)) return "Enviar respostas";
  return "Submit answers";
}

function repairSplitActivityHeadings(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const consumed = new Set<ExtractedLayoutBlock>();
  const repaired = blocks.map((block) => {
    const label = block.text?.trim() ?? "";
    if (!/^(?:exercise|activity|practice|zoezi|shughuli)$/i.test(label))
      return block;
    const suffix = blocks
      .filter((candidate) => candidate !== block && !consumed.has(candidate))
      .filter((candidate) => /^(?:\d{1,2}|[ivxlcdm]+)$/i.test(candidate.text?.trim() ?? ""))
      .filter((candidate) => {
        const sameLine = Math.abs(
          candidate.bbox.y + candidate.bbox.h / 2 -
            (block.bbox.y + block.bbox.h / 2),
        ) <= pageHeight * .012;
        const follows =
          candidate.bbox.x >= block.bbox.x + block.bbox.w - pageWidth * .015 &&
          candidate.bbox.x <= block.bbox.x + block.bbox.w + pageWidth * .11;
        return sameLine && follows;
      })
      .sort((a, b) => a.bbox.x - b.bbox.x)[0];
    if (!suffix) return block;
    consumed.add(suffix);
    const right = Math.max(
      block.bbox.x + block.bbox.w,
      suffix.bbox.x + suffix.bbox.w,
    );
    return {
      ...block,
      text: `${label} ${suffix.text!.trim()}`,
      bbox: { ...block.bbox, w: right - block.bbox.x },
    };
  });
  return repaired.filter((block) => !consumed.has(block));
}

type SemanticNumericTable = {
  blocks: ExtractedLayoutBlock[];
  bounds: { x: number; y: number; w: number; h: number };
  html: string;
  answerCount: number;
};

function buildSemanticNumericTablesByPanel(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  accent: string,
  panels: Array<{ x: number; y: number; w: number; h: number }>,
): SemanticNumericTable | undefined {
  const tables = panels
    .map((panel) =>
      buildSemanticNumericTable(
        blocks.filter((block) => {
          const cx = block.bbox.x + block.bbox.w / 2;
          const cy = block.bbox.y + block.bbox.h / 2;
          return cx >= panel.x && cx <= panel.x + panel.w && cy >= panel.y && cy <= panel.y + panel.h;
        }),
        pageWidth,
        pageHeight,
        accent,
        [],
      ),
    )
    .filter((table): table is SemanticNumericTable => Boolean(table));
  if (!tables.length) return undefined;
  const left = Math.min(...tables.map((table) => table.bounds.x));
  const top = Math.min(...tables.map((table) => table.bounds.y));
  const right = Math.max(...tables.map((table) => table.bounds.x + table.bounds.w));
  const bottom = Math.max(...tables.map((table) => table.bounds.y + table.bounds.h));
  return {
    blocks: tables.flatMap((table) => table.blocks),
    bounds: { x: left, y: top, w: right - left, h: bottom - top },
    html: tables.map((table) => table.html).join(""),
    answerCount: tables.reduce((sum, table) => sum + table.answerCount, 0),
  };
}

function buildSemanticLabelResponseTable(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  accent: string,
  activityPanels: Array<{ x: number; y: number; w: number; h: number }>,
): SemanticNumericTable | undefined {
  const pageText = blocks.map((block) => block.text?.trim() ?? "").join(" ");
  const numberWordCount = blocks.filter((block) =>
    /^(?:one|two|three|four|five|six|seven|eight|nine|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa)$/i.test(
      block.text?.trim() ?? "",
    ),
  ).length;
  // A numbered figure table followed by number words is reference/read-aloud
  // content, not nine missing answers. Replacing it with a two-column answer
  // table destroys the source's image, numeral, and word columns.
  if (
    numberWordCount >= 4 ||
    !/\b(?:write|fill|complete|missing|andika|jaza|kamilisha)\b/i.test(pageText)
  ) return undefined;
  const labels = blocks
    .filter((block) => /^\d{1,2}$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y);
  if (labels.length < 8) return undefined;
  const centerXs = labels.map((block) => block.bbox.x + block.bbox.w / 2);
  if (Math.max(...centerXs) - Math.min(...centerXs) > pageWidth * .08)
    return undefined;
  const gaps = labels.slice(1).map((block, index) =>
    block.bbox.y + block.bbox.h / 2 -
      (labels[index]!.bbox.y + labels[index]!.bbox.h / 2),
  );
  const rowGap = median(gaps.filter((gap) => gap > 0));
  if (!Number.isFinite(rowGap) || rowGap <= 0) return undefined;
  const panel = activityPanels.find((candidate) =>
    labels.every((label) =>
      label.bbox.y >= candidate.y - pageHeight * .02 &&
      label.bbox.y + label.bbox.h <= candidate.y + candidate.h + pageHeight * .02,
    ),
  );
  const left = panel?.x ?? Math.max(0, Math.min(...labels.map((label) => label.bbox.x)) - pageWidth * .035);
  const right = panel ? panel.x + panel.w : pageWidth * .92;
  const top = Math.max(
    panel?.y ?? 0,
    labels[0]!.bbox.y + labels[0]!.bbox.h / 2 - rowGap / 2,
  );
  const bottom = Math.min(
    panel ? panel.y + panel.h : pageHeight,
    labels.at(-1)!.bbox.y + labels.at(-1)!.bbox.h / 2 + rowGap / 2,
  );
  const safeAccent = safeColor(accent);
  const rows = labels.map((label) =>
    `<tr><th scope="row" data-numeric-layout="true" style="width:28%;border:.1cqw solid ${safeAccent};padding:.35cqw .55cqw;text-align:center;font:700 2cqw/1 ${sourceFontFamily(label.font)};color:${safeColor(label.font?.color ?? "#171717")}">${escapeHtml(label.text!.trim())}</th><td style="border:.1cqw solid ${safeAccent};padding:.35cqw .7cqw"><span aria-hidden="true" style="display:block;width:82%;margin:auto;border-bottom:.13cqw solid #555">&nbsp;</span></td></tr>`,
  ).join("");
  const bounds = { x: left, y: top, w: right - left, h: bottom - top };
  return {
    blocks: labels,
    bounds,
    answerCount: 0,
    html: `<table class="source-data-table" aria-label="Number response table from the printed page" style="position:absolute;z-index:4;left:${percent(bounds.x, pageWidth)}%;top:${percent(bounds.y, pageHeight)}%;width:${boundedPercent(bounds.x, bounds.w, pageWidth)}%;height:${boundedPercent(bounds.y, bounds.h, pageHeight)}%;border-collapse:collapse;table-layout:fixed;border:.12cqw solid ${safeAccent};background:#fff"><caption class="sr-only">Write each number in the requested form</caption><tbody>${rows}</tbody></table>`,
  };
}

function buildSemanticNumericTable(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  accent: string,
  activityPanels: Array<{ x: number; y: number; w: number; h: number }>,
): SemanticNumericTable | undefined {
  const numeric = blocks
    .filter((block) => /^\d{1,7}$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  if (numeric.length < 8) return undefined;
  const rows: ExtractedLayoutBlock[][] = [];
  for (const block of numeric) {
    const row = rows.find(
      (candidate) =>
        Math.abs(candidate[0]!.bbox.y - block.bbox.y) <= pageHeight * 0.014,
    );
    if (row) row.push(block);
    else rows.push([block]);
  }
  const regularRows = rows
    .map((row) => row.sort((a, b) => a.bbox.x - b.bbox.x))
    .filter((row) => row.length >= 3);
  if (regularRows.length < 2) return undefined;
  const commonColumns = Math.max(...regularRows.map((row) => row.length));
  const tableRows = regularRows.filter((row) => row.length >= commonColumns - 2);
  if (tableRows.length < 2) return undefined;
  const referenceRow = [...tableRows].sort((a, b) => b.length - a.length)[0]!;
  const centersX = referenceRow
    .map((cell) => cell.bbox.x + cell.bbox.w / 2)
    .sort((a, b) => a - b);
  const centersY = tableRows
    .map((row) => median(row.map((cell) => cell.bbox.y + cell.bbox.h / 2)))
    .sort((a, b) => a - b);
  const columnGap = median(
    centersX.slice(1).map((center, index) => center - centersX[index]!),
  );
  const rowGap = median(
    centersY.slice(1).map((center, index) => center - centersY[index]!),
  );
  if (!Number.isFinite(columnGap) || !Number.isFinite(rowGap)) return undefined;
  const verticalGaps = centersY
    .slice(1)
    .map((center, index) => center - centersY[index]!);
  // A page can contain an example grid plus several exercise grids. Merging
  // those regions into one semantic table stretches borders through headings
  // and whitespace. Preserve the measured source rules until each region can
  // be represented independently.
  const splitIndex = verticalGaps.findIndex((gap) => gap > rowGap * 2.05);
  if (splitIndex >= 0) {
    const rowGroups = [
      tableRows.slice(0, splitIndex + 1),
      tableRows.slice(splitIndex + 1),
    ].filter((group) => group.length >= 2);
    const childTables: SemanticNumericTable[] = rowGroups
      .map((group) => {
        const top = Math.min(...group.flatMap((row) => row.map((cell) => cell.bbox.y)));
        const bottom = Math.max(...group.flatMap((row) => row.map((cell) => cell.bbox.y + cell.bbox.h)));
        return buildSemanticNumericTable(
          blocks.filter(
            (block) =>
              block.bbox.y + block.bbox.h >= top - pageHeight * .025 &&
              block.bbox.y <= bottom + pageHeight * .025,
          ),
          pageWidth,
          pageHeight,
          accent,
          activityPanels,
        );
      })
      .filter((table): table is NonNullable<typeof table> => Boolean(table));
    if (childTables.length >= 2) {
      const left = Math.min(...childTables.map((table) => table.bounds.x));
      const top = Math.min(...childTables.map((table) => table.bounds.y));
      const right = Math.max(...childTables.map((table) => table.bounds.x + table.bounds.w));
      const bottom = Math.max(...childTables.map((table) => table.bounds.y + table.bounds.h));
      return {
        blocks: childTables.flatMap((table) => table.blocks),
        bounds: { x: left, y: top, w: right - left, h: bottom - top },
        html: childTables.map((table) => table.html).join(""),
        answerCount: childTables.reduce((sum, table) => sum + table.answerCount, 0),
      };
    }
    return undefined;
  }
  const normalizedRows = tableRows.map((row) =>
    centersX.map((center) =>
      row
        .map((cell) => ({ cell, distance: Math.abs(cell.bbox.x + cell.bbox.w / 2 - center) }))
        .sort((a, b) => a.distance - b.distance)[0]
        ?.distance <= columnGap * 0.42
        ? row
            .map((cell) => ({ cell, distance: Math.abs(cell.bbox.x + cell.bbox.w / 2 - center) }))
            .sort((a, b) => a.distance - b.distance)[0]!.cell
        : undefined,
    ),
  );
  const cells = normalizedRows.flatMap((row) => row.filter((cell): cell is ExtractedLayoutBlock => Boolean(cell)));
  const tableTop = centersY[0]! - rowGap / 2;
  const nearestTextBottom = blocks
    .filter(
      (block) =>
        !cells.includes(block) &&
        block.bbox.y + block.bbox.h <= centersY[0]! &&
        block.bbox.y + block.bbox.h >= tableTop - pageHeight * .04,
    )
    .reduce(
      (bottom, block) => Math.max(bottom, block.bbox.y + block.bbox.h),
      0,
    );
  const boundedTop = Math.max(
    0,
    tableTop,
    nearestTextBottom ? nearestTextBottom + pageHeight * .004 : 0,
  );
  const nearestTextTop = blocks
    .filter(
      (block) =>
        !cells.includes(block) &&
        block.bbox.y > tableTop &&
        (activityHeadingPattern.test(block.text?.trim() ?? "") ||
          /^(?:trace|draw|write|read|count|match|fill)\b/i.test(
            block.text?.trim() ?? "",
          )),
    )
    .reduce(
      (top, block) => Math.min(top, block.bbox.y),
      Number.POSITIVE_INFINITY,
    );
  const nextPanelTop = activityPanels
    .filter((panel) => panel.y > tableTop + pageHeight * .04)
    .reduce(
      (top, panel) => Math.min(top, panel.y),
      Number.POSITIVE_INFINITY,
    );
  const tableBottom = Math.min(
    pageHeight,
    centersY.at(-1)! + rowGap / 2,
    Number.isFinite(nearestTextTop)
      ? nearestTextTop - pageHeight * .025
      : pageHeight,
    Number.isFinite(nextPanelTop)
      ? nextPanelTop - pageHeight * .018
      : pageHeight,
  );
  const tableCenterX = median(centersX);
  const tableCenterY = median(centersY);
  const ownerPanel = activityPanels
    .filter(
      (panel) =>
        tableCenterX >= panel.x - pageWidth * .015 &&
        tableCenterX <= panel.x + panel.w + pageWidth * .015 &&
        tableCenterY >= panel.y - pageHeight * .015 &&
        tableCenterY <= panel.y + panel.h + pageHeight * .015,
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const rawLeft = Math.max(0, centersX[0]! - columnGap / 2);
  const rawRight = Math.min(pageWidth, centersX.at(-1)! + columnGap / 2);
  const panelInsetX = pageWidth * .012;
  const panelInsetY = pageHeight * .012;
  const constrainedLeft = ownerPanel
    ? Math.max(rawLeft, ownerPanel.x + panelInsetX)
    : rawLeft;
  const constrainedRight = ownerPanel
    ? Math.min(rawRight, ownerPanel.x + ownerPanel.w - panelInsetX)
    : rawRight;
  const constrainedTop = ownerPanel
    ? Math.max(boundedTop, ownerPanel.y + panelInsetY)
    : boundedTop;
  const constrainedBottom = ownerPanel
    ? Math.min(tableBottom, ownerPanel.y + ownerPanel.h - panelInsetY)
    : tableBottom;
  const bounds = {
    x: constrainedLeft,
    y: constrainedTop,
    w: Math.max(pageWidth * .12, constrainedRight - constrainedLeft),
    // Keep the measured row span. Compressing this box made cells shorter
    // than their source rows, which caused numerals to crowd borders and
    // headings from the next exercise to overlap the table.
    h: Math.max(pageHeight * .02, constrainedBottom - constrainedTop),
  };
  // Derive one size for the entire table from the measured row and column
  // tracks. A table is one typographic cluster; per-fragment approximation
  // makes identical numerals visibly jump in size.
  const rowHeightCap = (bounds.h / Math.max(1, normalizedRows.length)) * 0.7;
  const columnCount = Math.max(1, ...normalizedRows.map((row) => row.length));
  const columnWidthCap = (bounds.w / columnCount) * 0.55;
  const fontSize = Math.min(
    median(cells.map((cell) => cell.font?.size ?? cell.bbox.h * .82)),
    rowHeightCap,
    columnWidthCap,
  );
  const inferredTableColor = cells
    .map((cell) => cell.font?.color)
    .find((color) => color && /^#[0-9a-f]{6}$/i.test(color) && !isLightColor(color));
  const safeAccent = safeColor(inferredTableColor ?? accent);
  const responsiveFontSize = Math.max(
    1.75,
    Math.min(3.6, (Math.max(5, fontSize) / pageWidth) * 100),
  ).toFixed(3);
  const answerCount = normalizedRows.reduce((count, row) => count + row.filter((cell) => !cell).length, 0);
  const html = `<table class="source-data-table" aria-label="Number table from the printed page" style="position:absolute;z-index:4;left:${percent(bounds.x, pageWidth)}%;top:${percent(bounds.y, pageHeight)}%;width:${boundedPercent(bounds.x, bounds.w, pageWidth)}%;height:${boundedPercent(bounds.y, bounds.h, pageHeight)}%;border-collapse:collapse;table-layout:fixed;border:.12cqw solid ${safeAccent};background:#fff;color:#171717;font:${responsiveFontSize}cqw/1.05 Arial,sans-serif"><caption class="sr-only">Number table from the printed page</caption><tbody>${normalizedRows.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => cell ? `<td data-numeric-layout="true" style="border:.1cqw solid ${safeAccent};padding:.32cqw .42cqw!important;text-align:center;vertical-align:middle;background:#fff;color:${safeColor(cell.font?.color ?? "#171717")};font-family:${sourceFontFamily(cell.font)};font-weight:700;font-style:${/italic|oblique/i.test(`${cell.font?.style ?? ""} ${cell.font?.name ?? ""}`) ? "italic" : "normal"}">${escapeHtml(cell.text!.trim())}</td>` : `<td style="border:.1cqw solid ${safeAccent};padding:.32cqw .42cqw!important;text-align:center;vertical-align:middle;background:#fff"><span aria-hidden="true" style="display:block;width:74%;margin:auto;border-bottom:.14cqw solid ${safeAccent}">&nbsp;</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return { blocks: cells, bounds, html, answerCount };
}

function buildLabeledItemAnswerTargets({
  textBlocks,
  existingTargets,
  pageWidth,
  pageHeight,
}: {
  textBlocks: ExtractedLayoutBlock[];
  existingTargets: Array<{ bbox: ExtractedLayoutBlock["bbox"] }>;
  pageWidth: number;
  pageHeight: number;
}) {
  const questions = textBlocks
    .filter((block) => /^\d{1,2}[.)]$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y);
  if (questions.length < 2) return [];
  const targets: Array<{
    type: "text";
    text: string;
    confidence: number;
    evidence: string;
    bbox: ExtractedLayoutBlock["bbox"];
  }> = [];
  for (const [questionIndex, question] of questions.entries()) {
    const nextTop = questions[questionIndex + 1]?.bbox.y ?? pageHeight * 0.94;
    const regionBlocks = textBlocks.filter(
      (block) => block.bbox.y >= question.bbox.y && block.bbox.y < nextTop,
    );
    const regionText = regionBlocks.map((block) => block.text ?? "").join(" ");
    if (
      !/\b(?:answer|andika|bainisha|calculate|find|hesabu|jibu|kokotoa|taja|tafuta|weka)\b/i.test(
        regionText,
      )
    )
      continue;
    const labels = regionBlocks.filter((block) =>
      /^(?:\([a-z]\)|[a-z][.)])(?:\s+\S.*)?$/i.test(
        block.text?.trim() ?? "",
      ),
    );
    if (labels.length < 3) continue;
    const existingInRegion = existingTargets.filter(
      (target) =>
        target.bbox.y >= question.bbox.y && target.bbox.y < nextTop,
    );
    if (existingInRegion.length >= labels.length) continue;
    for (const label of labels) {
      const combinedItem = /^(?:\([a-z]\)|[a-z][.)])\s+\S/i.test(
        label.text?.trim() ?? "",
      );
      const sameRow = combinedItem
        ? label
        : regionBlocks
            .filter(
              (block) =>
                block !== label &&
                block.bbox.x > label.bbox.x + label.bbox.w &&
                Math.abs(block.bbox.y - label.bbox.y) <=
                  Math.max(label.bbox.h, block.bbox.h) * 0.65 &&
                !/^(?:\([a-z]\)|[a-z][.)])$/i.test(
                  block.text?.trim() ?? "",
                ),
            )
            .sort((a, b) => a.bbox.x - b.bbox.x)[0];
      if (!sameRow) continue;
      // These grids often have three tightly packed columns. A control placed
      // to the right collides with the next item, so use the small writing
      // space directly below the printed value inside its own column.
      const x = sameRow.bbox.x;
      const targetHeight = Math.max(4, Math.min(7, sameRow.bbox.h * 0.34));
      targets.push({
        type: "text",
        text: `${question.text ?? "Question"} ${label.text ?? "item"}`,
        confidence: 0.88,
        evidence: "labelled-question-item",
        bbox: {
          x,
          y: sameRow.bbox.y + sameRow.bbox.h + 1,
          w: Math.max(
            pageWidth * 0.055,
            Math.min(
              pageWidth * 0.105,
              Math.max(sameRow.bbox.w, pageWidth * 0.055),
              pageWidth - x - pageWidth * 0.025,
            ),
          ),
          h: targetHeight,
        },
      });
    }
  }
  return targets;
}

/** Place a real writing line directly beneath each numbered prose question.
 * PDF extraction may keep the number in its own block or merge it with the
 * first prompt line, so recognize both shapes. Interrogative wording and a run
 * of numbered items keep examples and page furniture out of this path. */
function buildProseQuestionAnswerTargets({
  textBlocks,
  existingTargets: _existingTargets,
  pageWidth,
  pageHeight,
}: {
  textBlocks: ExtractedLayoutBlock[];
  existingTargets: Array<{ bbox: ExtractedLayoutBlock["bbox"] }>;
  pageWidth: number;
  pageHeight: number;
}) {
  const labels = textBlocks
    .filter((block) => /^\d{1,2}[.)](?:\s+\S.*)?$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  if (labels.length < 2) return [];
  const denseQuestionRun =
    labels.length >= 4 &&
    textBlocks.filter((block) => /\?/.test(block.text ?? "")).length >= 3;
  const targets: Array<{
    type: "text";
    text: string;
    confidence: number;
    evidence: string;
    correctAnswer?: string;
    bbox: ExtractedLayoutBlock["bbox"];
  }> = [];
  for (const [index, label] of labels.entries()) {
    const nextTop = labels[index + 1]?.bbox.y ?? pageHeight * 0.94;
    const region = textBlocks.filter(
      (block) => block.bbox.y >= label.bbox.y && block.bbox.y < nextTop,
    );
    const prompt = region
      .map((block) => block.text?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    // PDF line boxes can overlap the following number by a fraction of a
    // point, so the final question-mark line is sometimes assigned to the
    // next geometric region. Accept clear interrogative wording as equivalent
    // evidence instead of dropping the response entirely.
    if (
      (!/\?/.test(prompt) &&
        !/\b(?:je|gani|ngapi|what|which|how|calculate|find|tafuta|kokotoa)\b/i.test(
          prompt,
        )) ||
      (belongsToWorkedExample(label, textBlocks) && !denseQuestionRun)
    )
      continue;
    const lastLineBottom = Math.max(
      ...region.map((block) => block.bbox.y + block.bbox.h),
    );
    const available = nextTop - lastLineBottom;
    // Dense word-problem lists only leave a short baseline between questions.
    // Keep the unfocused control compact so every answer stays directly below
    // its owner without covering the next printed question.
    const controlHeight = Math.max(10, Math.min(14, pageHeight * 0.016));
    // If the printed questions are tightly packed, use the final line's lower
    // leading rather than moving the answer to an unrelated page edge.
    const y = Math.min(
      nextTop - controlHeight - pageHeight * 0.003,
      lastLineBottom + Math.max(1, Math.min(pageHeight * 0.006, available * 0.18)),
    );
    // A merged number + prompt block can span most of the line. Derive the
    // writing-line inset from the number's left edge instead of that block's
    // full width, which would otherwise push the control outside the frame.
    const x = Math.max(
      pageWidth * 0.2,
      Math.min(pageWidth * 0.32, label.bbox.x + pageWidth * 0.08),
    );
    targets.push({
      type: "text",
      text: prompt,
      confidence: 0.94,
      evidence: "numbered-prose-question",
      correctAnswer: inferCorrectAnswers(prompt)[0],
      bbox: {
        x,
        y,
        w: Math.min(pageWidth * 0.68, pageWidth - x - pageWidth * 0.075),
        h: controlHeight,
      },
    });
  }
  return targets;
}

/** Fraction-identification exercises commonly continue onto the next page as
 * labelled diagrams (a)-(d), without repeating the instruction. Preserve the
 * diagram and put one unobtrusive response line beneath each labelled row. */
function buildFractionDiagramAnswerTargets({
  textBlocks,
  assets,
  existingTargets,
  pageWidth,
  pageHeight,
}: {
  textBlocks: ExtractedLayoutBlock[];
  assets: ExtractedPageAsset[];
  existingTargets: Array<{ bbox: ExtractedLayoutBlock["bbox"] }>;
  pageWidth: number;
  pageHeight: number;
}) {
  const labels = textBlocks
    .filter((block) => /^\([a-d]\)$|^[a-d][.)]$/i.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y);
  if (labels.length < 2) return [];
  const pageText = textBlocks.map((block) => block.text ?? "").join(" ");
  const hasFractionEvidence =
    /\b(?:fraction|sehemu|kivuli|shaded)\b/i.test(pageText) ||
    labels.some((label, index) => {
      const nextTop = labels[index + 1]?.bbox.y ?? pageHeight * 0.9;
      return assets.some(
        (asset) =>
          asset.bounds.y >= label.bbox.y - pageHeight * 0.025 &&
          asset.bounds.y + asset.bounds.h / 2 < nextTop &&
          asset.bounds.w >= pageWidth * 0.18,
      );
    });
  if (!hasFractionEvidence) return [];
  return labels.flatMap((label, index) => {
    const nextNumberedQuestion = textBlocks
      .filter(
        (block) =>
          block.bbox.y > label.bbox.y &&
          /^\d{1,2}[.)]$/.test(block.text?.trim() ?? ""),
      )
      .sort((a, b) => a.bbox.y - b.bbox.y)[0];
    const nextTop = Math.min(
      labels[index + 1]?.bbox.y ?? pageHeight * 0.9,
      nextNumberedQuestion?.bbox.y ?? pageHeight * 0.9,
    );
    if (
      existingTargets.some(
        (target) => target.bbox.y >= label.bbox.y && target.bbox.y < nextTop,
      )
    )
      return [];
    const rowInkBottom = Math.max(
      label.bbox.y + label.bbox.h,
      ...assets
        .filter(
          (asset) =>
            asset.bounds.y >= label.bbox.y - pageHeight * 0.025 &&
            asset.bounds.y + asset.bounds.h / 2 < nextTop,
        )
        .map((asset) => asset.bounds.y + asset.bounds.h),
      ...textBlocks
        .filter((block) => block.bbox.y >= label.bbox.y && block.bbox.y < nextTop)
        .map((block) => block.bbox.y + block.bbox.h),
    );
    const height = Math.max(9, Math.min(15, pageHeight * 0.017));
    const y = Math.min(
      // Leave a physical safety gutter before the following labelled figure.
      // A smaller gap can round to a sub-pixel overlap after the page is
      // scaled into the reader, which still counts as covering the artwork.
      nextTop - height - pageHeight * 0.008,
      rowInkBottom + pageHeight * 0.004,
    );
    if (y <= label.bbox.y + label.bbox.h) return [];
    return [{
      type: "text" as const,
      text: `Fraction shown in ${label.text?.trim() ?? "the diagram"}`,
      confidence: 0.9,
      evidence: "labelled-fraction-diagram",
      bbox: {
        x: Math.max(pageWidth * 0.24, label.bbox.x + label.bbox.w + pageWidth * 0.04),
        y,
        w: pageWidth * 0.24,
        h: height,
      },
    }];
  });
}

function isUnansweredEquation(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (/^=\s*(?:\?|[_–—-]+)?$/.test(text)) return true;
  // PDF text extraction commonly keeps the full printed calculation in one
  // measured block. An equals sign at the end is the source's answer anchor.
  return /\d\s*(?:[+\-−×x÷])\s*\d[^=]{0,36}=\s*(?:\?|[_–—-]+)?$/.test(text);
}

function buildActivityPanels(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  assets: ExtractedPageAsset[] = [],
) {
  const ordered = [...blocks].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  );
  const headings = ordered.filter((block) =>
    /^(?:activity|exercise|practice|zoezi|shughuli|maswali)(?:\s+(?:la\s+)?\d+)?[.:]?$/i.test(
      block.text?.trim() ?? "",
    ),
  );
  return headings.map((heading) => {
    const next = ordered.find(
      (block) =>
        block.bbox.y > heading.bbox.y &&
        (isNumberedExampleHeading(block) || headings.includes(block)),
    );
    const section = ordered.filter(
      (block) =>
        block.bbox.y >= heading.bbox.y && (!next || block.bbox.y < next.bbox.y),
    );
    const sectionAssets = assets.filter(
      (asset) =>
        !isDecorativeGeometryAsset(asset, pageWidth, pageHeight) &&
        asset.bounds.y + asset.bounds.h >= heading.bbox.y &&
        (!next || asset.bounds.y < next.bbox.y),
    );
    const left = Math.max(pageWidth * 0.06, heading.bbox.x - pageWidth * 0.004);
    // The heading badge itself is rendered at least pageWidth*0.23 wide
    // (see the matching `renderedWidth` floor for activityHeading in the
    // text-block renderer below) even when its raw OCR bbox measured
    // narrower - so the panel must be measured against that same enforced
    // minimum, or a short label like "Exercise 1" can render wider than the
    // panel computed to contain it and poke out past its right border.
    const effectiveHeadingWidth = Math.max(heading.bbox.w, pageWidth * 0.23);
    const measuredRight = Math.min(
      pageWidth * 0.94,
      Math.max(
        heading.bbox.x + effectiveHeadingWidth,
        ...section.map((block) => block.bbox.x + block.bbox.w),
        ...sectionAssets.map((asset) => asset.bounds.x + asset.bounds.w),
      ) +
        pageWidth * 0.012,
    );
    const usesRightColumn = section.some(
      (block) => block.bbox.x + block.bbox.w / 2 > pageWidth * 0.58,
    );
    const compactAssets = assets.filter(
      (asset) =>
        !isDecorativeGeometryAsset(asset, pageWidth, pageHeight) &&
        asset.bounds.y >= heading.bbox.y &&
        (!next || asset.bounds.y < next.bbox.y) &&
        asset.bounds.w / pageWidth >= 0.08 &&
        asset.bounds.w / pageWidth <= 0.28 &&
        asset.bounds.h / pageHeight >= 0.025 &&
        asset.bounds.h / pageHeight <= 0.09,
    );
    const repeatedAnswerColumn = compactAssets.some((asset) =>
      compactAssets.filter((candidate) =>
        Math.abs(candidate.bounds.x - asset.bounds.x) <= pageWidth * 0.025 &&
        Math.abs(candidate.bounds.w - asset.bounds.w) <= pageWidth * 0.025,
      ).length >= 3,
    );
    const right = repeatedAnswerColumn
      ? Math.max(measuredRight, pageWidth * 0.94)
      : usesRightColumn
      ? Math.max(measuredRight, pageWidth * 0.88)
      : measuredRight;
    const contentBottom = Math.max(
      ...section.map((block) => block.bbox.y + block.bbox.h),
      ...sectionAssets.map((asset) => asset.bounds.y + asset.bounds.h),
    );
    const naturalBottom = Math.min(
      pageHeight * 0.94,
      next
        ? Math.min(
            next.bbox.y - pageHeight * 0.012,
            contentBottom + pageHeight * 0.014,
          )
        : contentBottom + pageHeight * 0.014,
    );
    // A last exercise in the lower half of a primary-school page commonly
    // owns the remaining printed surface even when extraction missed pale
    // answer rules or vector-only artwork. Keeping only the detected ink
    // makes such panels collapse to half their source height (notably the
    // Arithmetic exercises on physical pages 26-28). Preserve that printed
    // extent without changing the fixed source-page width.
    const bottom = !next && heading.bbox.y >= pageHeight * 0.42
      ? Math.max(naturalBottom, pageHeight * 0.91)
      : naturalBottom;
    const top = Math.max(0, heading.bbox.y - pageHeight * 0.004);
    return {
      x: left,
      // Keep the complete label within its owning surface. The tab can still
      // visually meet the border, but it must never float outside the box.
      y: top,
      w: right - left,
      h: Math.max(1, bottom - top),
    };
  });
}

function belongsToWorkedExample(
  block: ExtractedLayoutBlock,
  blocks: ExtractedLayoutBlock[],
) {
  const precedingBoundary = blocks
    .filter(
      (candidate) =>
        candidate.bbox.y <= block.bbox.y &&
        /^(?:mfano|example|activity|exercise|practice|zoezi|shughuli|maswali)\b/i.test(
          candidate.text?.trim() ?? "",
        ),
    )
    .sort((a, b) => b.bbox.y - a.bbox.y)[0];
  return /^(?:mfano|example)\b/i.test(precedingBoundary?.text?.trim() ?? "");
}

function belongsToOralRegion(
  block: ExtractedLayoutBlock,
  blocks: ExtractedLayoutBlock[],
) {
  const precedingDirective = blocks
    .filter(
      (candidate) =>
        candidate.bbox.y <= block.bbox.y &&
        (oralInstruction.test(candidate.text ?? "") ||
          /^(?:activity|exercise|practice|zoezi|shughuli|maswali)\b|\b(?:write|complete|fill|andika|jaza)\b/i.test(
            candidate.text?.trim() ?? "",
          )),
    )
    .sort((a, b) => b.bbox.y - a.bbox.y)[0];
  return oralInstruction.test(precedingDirective?.text ?? "");
}

function buildStackedFractionRows(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const rows: Array<{
    equals: ExtractedLayoutBlock;
    components: ExtractedLayoutBlock[];
    numerators: [number, number];
    denominator: number;
    latex: string;
    label: string;
    fontSize: number;
    bbox: { x: number; y: number; w: number; h: number };
  }> = [];
  const equalsBlocks = blocks.filter(
    (block) => block.text?.trim() === "=",
  );
  for (const equals of equalsBlocks) {
    const centerY = equals.bbox.y + equals.bbox.h / 2;
    const plus = blocks
      .filter(
        (candidate) =>
          candidate.text?.trim() === "+" &&
          candidate.bbox.x < equals.bbox.x &&
          Math.abs(candidate.bbox.y + candidate.bbox.h / 2 - centerY) <=
            pageHeight * 0.014,
      )
      .sort((a, b) => b.bbox.x - a.bbox.x)[0];
    if (!plus) continue;
    const left = plus.bbox.x - pageWidth * 0.065;
    const right = equals.bbox.x + equals.bbox.w;
    const numericBlocks = blocks.filter(
      (candidate) =>
        candidate.bbox.x + candidate.bbox.w >= left &&
        candidate.bbox.x <= right &&
        Math.abs(candidate.bbox.y + candidate.bbox.h / 2 - centerY) <=
          pageHeight * 0.045 &&
        /^\d+(?:\s+\d+)*$/.test(candidate.text?.trim() ?? ""),
    );
    const tokens = (candidates: ExtractedLayoutBlock[]) =>
      candidates
        .sort((a, b) => a.bbox.x - b.bbox.x)
        .flatMap((candidate) => candidate.text?.match(/\d+/g) ?? [])
        .map(Number)
        .filter(Number.isFinite);
    const numeratorBlocks = numericBlocks.filter(
      (candidate) => candidate.bbox.y + candidate.bbox.h <= centerY,
    );
    const denominatorBlocks = numericBlocks.filter(
      (candidate) => candidate.bbox.y >= centerY,
    );
    const numerators = tokens(numeratorBlocks);
    const denominators = tokens(denominatorBlocks);
    if (
      numerators.length < 2 ||
      denominators.length < 2 ||
      denominators[0] !== denominators[1]
    )
      continue;
    const components = [
      ...new Set([
        plus,
        equals,
        ...numeratorBlocks,
        ...denominatorBlocks,
      ]),
    ];
    const minX = Math.min(...components.map((block) => block.bbox.x));
    const minY = Math.min(...components.map((block) => block.bbox.y));
    const maxX = Math.max(
      ...components.map((block) => block.bbox.x + block.bbox.w),
    );
    const maxY = Math.max(
      ...components.map((block) => block.bbox.y + block.bbox.h),
    );
    const denominator = denominators[0]!;
    const pair: [number, number] = [numerators[0]!, numerators[1]!];
    if (
      rows.some(
        (row) =>
          Math.abs(row.equals.bbox.y - equals.bbox.y) <= pageHeight * 0.018 &&
          components.some((component) => row.components.includes(component)),
      )
    )
      continue;
    const fontSize = Math.max(
      10,
      ...components.map(
        (block) => block.font?.size ?? Math.max(8, block.bbox.h * 0.75),
      ),
    );
    rows.push({
      equals,
      components,
      numerators: pair,
      denominator,
      latex: `\\frac{${pair[0]}}{${denominator}} + \\frac{${pair[1]}}{${denominator}} =`,
      label: `${pair[0]} over ${denominator} plus ${pair[1]} over ${denominator} equals`,
      fontSize,
      bbox: {
        x: minX - pageWidth * 0.004,
        y: minY - pageHeight * 0.003,
        w: maxX - minX + pageWidth * 0.012,
        h: maxY - minY + pageHeight * 0.006,
      },
    });
  }
  return rows.sort((a, b) =>
    Math.abs(a.bbox.y - b.bbox.y) <= pageHeight * 0.018
      ? a.bbox.x - b.bbox.x
      : a.bbox.y - b.bbox.y,
  );
}

function inferStackedFractionSumAnswer(
  equalsBlock: ExtractedLayoutBlock,
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const centerY = equalsBlock.bbox.y + equalsBlock.bbox.h / 2;
  const plus = blocks
    .filter(
      (candidate) =>
        candidate.text?.trim() === "+" &&
        candidate.bbox.x < equalsBlock.bbox.x &&
        Math.abs(candidate.bbox.y + candidate.bbox.h / 2 - centerY) <=
          pageHeight * 0.014,
    )
    .sort((a, b) => b.bbox.x - a.bbox.x)[0];
  if (!plus) return undefined;
  const left = plus.bbox.x - pageWidth * 0.065;
  const right = equalsBlock.bbox.x + equalsBlock.bbox.w;
  const nearbyNumbers = blocks.filter(
    (candidate) =>
      candidate.bbox.x + candidate.bbox.w >= left &&
      candidate.bbox.x <= right &&
      Math.abs(candidate.bbox.y + candidate.bbox.h / 2 - centerY) <=
        pageHeight * 0.045 &&
      /^\d+(?:\s+\d+)*$/.test(candidate.text?.trim() ?? ""),
  );
  const tokens = (candidates: ExtractedLayoutBlock[]) =>
    candidates
      .sort((a, b) => a.bbox.x - b.bbox.x)
      .flatMap((candidate) => candidate.text?.match(/\d+/g) ?? [])
      .map(Number)
      .filter(Number.isFinite);
  const numerators = tokens(
    nearbyNumbers.filter(
      (candidate) => candidate.bbox.y + candidate.bbox.h <= centerY,
    ),
  );
  const denominators = tokens(
    nearbyNumbers.filter((candidate) => candidate.bbox.y >= centerY),
  );
  if (
    numerators.length < 2 ||
    denominators.length < 2 ||
    denominators[0] !== denominators[1]
  )
    return undefined;
  return `${numerators[0]! + numerators[1]!}/${denominators[0]}`;
}

function buildExamplePanels(
  blocks: ExtractedLayoutBlock[],
  assets: ExtractedPageAsset[],
  pageWidth: number,
  pageHeight: number,
) {
  const ordered = [...blocks].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  );
  const headings = ordered.filter(isNumberedExampleHeading);
  const panels = headings.map((heading) => {
    const next = ordered.find(
      (block) =>
        block.bbox.y > heading.bbox.y &&
        (isNumberedExampleHeading(block) ||
          /^(?:activity|exercise|practice|zoezi|shughuli|maswali)\b/i.test(
            block.text?.trim() ?? "",
          )),
    );
    const section = ordered.filter(
      (block) =>
        block.bbox.y >= heading.bbox.y && (!next || block.bbox.y < next.bbox.y),
    );
    const sectionAssets = assets.filter(
      (asset) =>
        !isDecorativeGeometryAsset(asset, pageWidth, pageHeight) &&
        asset.bounds.y + asset.bounds.h >= heading.bbox.y &&
        (!next || asset.bounds.y < next.bbox.y),
    );
    const horizontalExtents = [
      ...section.map((block) => ({ x: block.bbox.x, right: block.bbox.x + block.bbox.w })),
      ...sectionAssets.map((asset) => ({ x: asset.bounds.x, right: asset.bounds.x + asset.bounds.w })),
    ];
    const left = Math.max(
      pageWidth * 0.06,
      Math.min(...horizontalExtents.map((item) => item.x)) - pageWidth * 0.012,
    );
    const right = Math.min(
      pageWidth * 0.94,
      Math.max(...horizontalExtents.map((item) => item.right)) +
        pageWidth * 0.012,
    );
    const top = Math.max(0, heading.bbox.y - pageHeight * 0.006);
    const contentBottom = Math.max(
      ...section.map((block) => block.bbox.y + block.bbox.h),
      ...sectionAssets.map((asset) => asset.bounds.y + asset.bounds.h),
    );
    const bottom = Math.min(
      pageHeight * 0.94,
      next
        ? Math.min(
            next.bbox.y - pageHeight * 0.025,
            contentBottom + pageHeight * 0.018,
          )
        : contentBottom + pageHeight * 0.018,
    );
    return { x: left, y: top, w: right - left, h: Math.max(1, bottom - top) };
  });
  // A sequence of numbered examples presented on one tinted teaching surface
  // should remain one visual group rather than a stack of invented boxes.
  if (panels.length > 1 && !ordered.some((block) => activityHeadingPattern.test(block.text?.trim() ?? ""))) {
    const first = panels[0]!;
    const last = panels.at(-1)!;
    return [{
      x: Math.min(...panels.map((panel) => panel.x)),
      y: first.y,
      w: Math.max(...panels.map((panel) => panel.x + panel.w)) - Math.min(...panels.map((panel) => panel.x)),
      h: last.y + last.h - first.y,
    }];
  }
  return panels;
}

function isNumberedExampleHeading(block: ExtractedLayoutBlock) {
  const value = block.text?.trim() ?? "";
  return /^(?:mfano(?:\s+wa)?|example)\s+\d+[.:]?$/i.test(value);
}

function buildActivityGridCells(
  assets: ExtractedPageAsset[],
  textBlocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const labels = textBlocks.filter((block) =>
    /^\(?\d{1,2}\)?[.)]?$/.test(block.text?.trim() ?? ""),
  );
  const paired = assets
    .map((asset) => {
      const label = labels
        .map((block) => ({
          block,
          distance: Math.hypot(
            block.bbox.x - asset.bounds.x,
            block.bbox.y - asset.bounds.y,
          ),
        }))
        .filter(
          ({ block }) =>
            block.bbox.x >= asset.bounds.x - pageWidth * 0.12 &&
            block.bbox.x <= asset.bounds.x + asset.bounds.w * 0.65 &&
            block.bbox.y >= asset.bounds.y - pageHeight * 0.05 &&
            block.bbox.y <= asset.bounds.y + asset.bounds.h * 0.35,
        )
        .sort((a, b) => a.distance - b.distance)[0]?.block;
      return label ? { asset, label } : undefined;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort(
      (a, b) =>
        a.asset.bounds.y - b.asset.bounds.y ||
        a.asset.bounds.x - b.asset.bounds.x,
    );
  const rows: (typeof paired)[] = [];
  for (const item of paired) {
    const center = item.asset.bounds.y + item.asset.bounds.h / 2;
    const row = rows.find((candidate) => {
      const first = candidate[0]!;
      const firstCenter = first.asset.bounds.y + first.asset.bounds.h / 2;
      return Math.abs(center - firstCenter) <= pageHeight * 0.055;
    });
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => {
    if (row.length < 3) return [];
    row.sort((a, b) => a.asset.bounds.x - b.asset.bounds.x);
    const centers = row.map(({ asset }) => asset.bounds.x + asset.bounds.w / 2);
    const typicalStep = median(
      centers.slice(1).map((center, index) => center - centers[index]!),
    );
    const top = Math.max(
      0,
      Math.min(
        ...row.map(({ label, asset }) =>
          Math.min(label.bbox.y, asset.bounds.y),
        ),
      ) -
        pageHeight * 0.008,
    );
    const answerBlocks = textBlocks.filter((block) =>
      answerRuleMatches(block.text ?? "").length > 0,
    );
    const bottom = Math.min(
      pageHeight,
      Math.max(
        ...row.map(({ asset }) => {
          const response = answerBlocks.find((block) => {
            const centerX = block.bbox.x + block.bbox.w / 2;
            return (
              centerX >= asset.bounds.x - pageWidth * 0.02 &&
              centerX <= asset.bounds.x + asset.bounds.w + pageWidth * 0.02 &&
              block.bbox.y >= asset.bounds.y + asset.bounds.h &&
              block.bbox.y <=
                asset.bounds.y + asset.bounds.h + pageHeight * 0.08
            );
          });
          return response
            ? response.bbox.y + response.bbox.h + pageHeight * 0.01
            : asset.bounds.y + asset.bounds.h + pageHeight * 0.016;
        }),
      ),
    );
    return row.map(({ asset }, index) => {
      const left =
        index === 0
          ? Math.max(0, centers[0]! - typicalStep / 2)
          : (centers[index - 1]! + centers[index]!) / 2;
      const right =
        index === row.length - 1
          ? Math.min(pageWidth, centers[index]! + typicalStep / 2)
          : (centers[index]! + centers[index + 1]!) / 2;
      return { x: left, y: top, w: right - left, h: bottom - top };
    });
  });
}

/** Reconstruct the paired illustration cells used by early-years counting and
 * comparison pages. These cells are inferred from the source asset geometry,
 * not from generic card styling, so repeated rows keep their printed spacing. */
type IllustrationGridCell = {
  x: number;
  y: number;
  w: number;
  h: number;
  choiceGroup?: string;
  choiceValue?: "left" | "right";
  correctValue?: "left" | "right";
  choiceLabel?: string;
  sourceCard?: boolean;
};

function buildIllustrationGridCells(
  assets: ExtractedPageAsset[],
  textBlocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  activityPrompts: string[] = [],
) {
  const extractedHeadings = textBlocks
    .filter(
      (block) =>
        isNumberedExampleHeading(block) ||
        activityHeadingPattern.test(block.text?.trim() ?? ""),
    )
    .sort((a, b) => a.bbox.y - b.bbox.y);
  const continuationPrompt = activityPrompts.find((prompt) =>
    /\b(?:identify|choose|select|circle|tick|mark)\b.*\b(?:many|few)\b/i.test(
      prompt,
    ),
  );
  const headings = extractedHeadings.length
    ? extractedHeadings
    : continuationPrompt && assets.length >= 4
      ? [{
          type: "text" as const,
          text: continuationPrompt,
          bbox: {
            x: pageWidth * 0.08,
            y: Math.max(
              0,
              Math.min(...assets.map((asset) => asset.bounds.y)) -
                pageHeight * 0.035,
            ),
            w: pageWidth * 0.84,
            h: pageHeight * 0.02,
          },
        }]
      : [];
  if (!headings.length || assets.length < 4) return [];
  const cells: IllustrationGridCell[] = [];
  for (const [headingIndex, heading] of headings.entries()) {
    const nextTop = headings[headingIndex + 1]?.bbox.y ?? pageHeight * 0.93;
    const sectionAssets = assets
      .filter(({ bounds }) => {
        const centerX = bounds.x + bounds.w / 2;
        return (
          bounds.y >= heading.bbox.y + heading.bbox.h * 0.7 &&
          bounds.y + bounds.h <= nextTop - pageHeight * 0.006 &&
          centerX > pageWidth * 0.08 &&
          centerX < pageWidth * 0.92 &&
          // A complete left/right illustration cell can occupy almost half
          // the page; filtering at one third excluded the authoritative
          // composed groups and left only their inner artwork visible.
          bounds.w < pageWidth * 0.46 &&
          bounds.h < pageHeight * 0.22
        );
      })
      .filter(
        (asset) => !isDecorativeGeometryAsset(asset, pageWidth, pageHeight),
      )
      .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    // A source cell may be extracted either as several individual objects or
    // as one composed left/right group. Two authoritative group assets are
    // sufficient to reconstruct the pair of printed cards.
    if (sectionAssets.length < 2) continue;
    const bands: ExtractedPageAsset[][] = [];
    for (const asset of sectionAssets) {
      const band = bands.find((candidate) => {
        const top = Math.min(...candidate.map((item) => item.bounds.y));
        const bottom = Math.max(
          ...candidate.map((item) => item.bounds.y + item.bounds.h),
        );
        return (
          asset.bounds.y <= bottom + pageHeight * 0.018 &&
          asset.bounds.y + asset.bounds.h >= top - pageHeight * 0.018
        );
      });
      if (band) band.push(asset);
      else bands.push([asset]);
    }
    const sectionText = [textBlocks
      .filter(
        (block) => block.bbox.y >= heading.bbox.y && block.bbox.y < nextTop,
      )
      .map((block) => block.text ?? "")
      .join(" "), ...activityPrompts].join(" ");
    const selectionTarget = /\b(?:identify|choose|select|circle|tick|mark)\b/i.test(sectionText)
      ? /\bmany\b/i.test(sectionText)
        ? "many"
        : /\bfew\b/i.test(sectionText)
          ? "few"
          : undefined
      : undefined;
    for (const [bandIndex, band] of bands.entries()) {
      const leftAssets = band.filter(
        ({ bounds }) => bounds.x + bounds.w / 2 < pageWidth / 2,
      );
      const rightAssets = band.filter(
        ({ bounds }) => bounds.x + bounds.w / 2 >= pageWidth / 2,
      );
      if (!leftAssets.length || !rightAssets.length) continue;
      const top = Math.max(
        heading.bbox.y + heading.bbox.h + pageHeight * 0.01,
        Math.min(...band.map((asset) => asset.bounds.y)) - pageHeight * 0.01,
      );
      const bottom = Math.min(
        nextTop - pageHeight * 0.008,
        Math.max(...band.map((asset) => asset.bounds.y + asset.bounds.h)) +
          pageHeight * 0.012,
      );
      const sectionLeft = Math.max(
        pageWidth * 0.075,
        Math.min(...sectionAssets.map((asset) => asset.bounds.x)) -
          pageWidth * 0.012,
      );
      const sectionRight = Math.min(
        pageWidth * 0.925,
        Math.max(
          ...sectionAssets.map((asset) => asset.bounds.x + asset.bounds.w),
        ) + pageWidth * 0.012,
      );
      const gutter = pageWidth * 0.008;
      const choiceGroup = selectionTarget
        ? `illustration-choice-${headingIndex + 1}-${bandIndex + 1}`
        : undefined;
      // A "which side has more/fewer" question is never legitimately posed
      // with equal counts, so a raw-count tie almost always means asset
      // grouping merged or split an object rather than a genuine tie. Fall
      // back to comparing total illustrated area per side before giving up
      // (an undecidable tie is still possible and is left undefined so the
      // build validator flags it for review instead of guessing).
      const leftArea = leftAssets.reduce(
        (sum, asset) => sum + asset.bounds.w * asset.bounds.h,
        0,
      );
      const rightArea = rightAssets.reduce(
        (sum, asset) => sum + asset.bounds.w * asset.bounds.h,
        0,
      );
      const moreSide =
        leftAssets.length !== rightAssets.length
          ? leftAssets.length > rightAssets.length
            ? "left"
            : "right"
          : leftArea !== rightArea
            ? leftArea > rightArea
              ? "left"
              : "right"
            : undefined;
      const correctValue = selectionTarget && moreSide
        ? selectionTarget === "few"
          ? moreSide === "left" ? "right" : "left"
          : moreSide
        : undefined;
      cells.push(
        {
          x: sectionLeft,
          y: top,
          w: pageWidth / 2 - gutter - sectionLeft,
          h: Math.max(1, bottom - top),
          choiceGroup,
          choiceValue: choiceGroup ? "left" : undefined,
          correctValue,
          // Raw extracted-asset counts do not reliably equal true object
          // counts (a printed row of "6 cups" is often one merged composite
          // image, not 6 assets), so stating a number here would be
          // confidently wrong rather than just vague. Leave the count out
          // until a caption-derived count (post-Captioning) can back it.
          choiceLabel: choiceGroup
            ? `Select the left group for the ${selectionTarget} objects question`
            : undefined,
          sourceCard: isNumberedExampleHeading(heading),
        },
        {
          x: pageWidth / 2 + gutter,
          y: top,
          w: sectionRight - (pageWidth / 2 + gutter),
          h: Math.max(1, bottom - top),
          choiceGroup,
          choiceValue: choiceGroup ? "right" : undefined,
          correctValue,
          choiceLabel: choiceGroup
            ? `Select the right group for the ${selectionTarget} objects question`
            : undefined,
          sourceCard: isNumberedExampleHeading(heading),
        },
      );
    }
  }
  return cells;
}

function isDecorativeGeometryAsset(
  asset: ExtractedPageAsset,
  pageWidth: number,
  pageHeight: number,
) {
  const { x, y, w, h } = asset.bounds;
  return (
    ((x <= pageWidth * 0.045 || x + w >= pageWidth * 0.955) &&
      ((w <= pageWidth * 0.16 && h >= pageHeight * 0.35) ||
        (w <= pageWidth * 0.25 && h >= pageHeight * 0.7))) ||
    ((y <= pageHeight * 0.05 || y + h >= pageHeight * 0.95) &&
      h <= pageHeight * 0.13 &&
      w >= pageWidth * 0.18) ||
    (y >= pageHeight * 0.88 && w <= pageWidth * 0.25 && h <= pageHeight * 0.1)
  );
}

function sourceFontFamily(
  source: ExtractedLayoutBlock["font"],
  configured?: string,
) {
  // PDF font resources are frequently subset-embedded ("ABCDEF+TimesNewRomanPSMT"
  // vs "NimbusRomNo9L" vs "TimesLTStd-Roman" for what is visually the exact
  // same serif face). Without stripping the subset tag and style suffixes
  // first, two runs of identical-looking source text can carry different
  // enough raw names that one hits a keyword bucket below and the other
  // falls through to the generic default, rendering as a visibly different
  // font for text the printed book shows as uniform.
  const raw = `${source?.family ?? ""} ${source?.name ?? ""}`
    .replace(/\b[A-Z]{6}\+/g, "")
    .replace(/-?(?:MT|PSMT|PS|Bold|Italic|Oblique|Regular)\b/gi, "")
    .trim();
  if (/sassoon|maandishi|andika|comic|hand|school|chalk/i.test(raw))
    return "'Sassoon Primary','SassoonPrimary','Comic Sans MS','Andika',cursive";
  if (/sans|arial|helvetica|gill|futura|avenir/i.test(raw))
    return "Arial,'Helvetica Neue',sans-serif";
  if (/minion|serif|times|garamond|baskerville|georgia/i.test(raw))
    return "Merriweather,Georgia,'Times New Roman',serif";
  if (configured && configured !== "Adapt from source")
    return `'${escapeHtml(configured)}',Arial,sans-serif`;
  return "Arial,'Helvetica Neue',sans-serif";
}

function renderTableOfContents(
  entries: NonNullable<GeometryRenderOptions["tocEntries"]>,
  title = "Table of contents",
  page: GeometryPage,
  pageWidth: number,
  pageHeight: number,
) {
  const blocks = (page.layoutBlocks ?? []).filter((block) => block.type === "text" && block.text?.trim());
  const effectiveEntries = entries.length ? entries : inferSourceTocEntries(blocks);
  const heading = blocks.find((block) => /^(?:table of contents|contents|yaliyomo|faharasa)$/i.test(block.text!.trim()));
  const rows = blocks.filter((block) => block.bbox.y > (heading?.bbox.y ?? pageHeight * .06) && block.bbox.y < pageHeight * .92);
  const left = rows.length ? Math.min(...rows.map((block) => block.bbox.x)) : pageWidth * .12;
  const right = rows.length ? Math.max(...rows.map((block) => block.bbox.x + block.bbox.w)) : pageWidth * .88;
  const top = heading?.bbox.y ?? pageHeight * .08;
  const bottom = rows.length ? Math.max(...rows.map((block) => block.bbox.y + block.bbox.h)) : pageHeight * .9;
  const headingCenter = heading ? heading.bbox.x + heading.bbox.w / 2 : pageWidth / 2;
  const align = headingCenter < pageWidth * .4 ? "left" : headingCenter > pageWidth * .6 ? "right" : "center";
  const titleSize = Math.max(2, ((heading?.font?.size ?? 22) / pageWidth) * 100);
  const titleColor = safeColor(heading?.font?.color ?? "#171717");
  const rowSizes = rows.map((block) => block.font?.size).filter((size): size is number => Boolean(size));
  const rowSize = Math.max(1.2, ((rowSizes.sort((a,b) => a-b)[Math.floor(rowSizes.length / 2)] ?? 12) / pageWidth) * 100);
  const rowColor = safeColor(rows.find((block) => block.font?.color)?.font?.color ?? "#252525");
  const usesLeaders = blocks.some((block) => /\.{3,}/.test(block.text ?? ""));
  const navStyle = `left:${percent(left,pageWidth)}%;top:${percent(top,pageHeight)}%;width:${boundedPercent(left,right-left,pageWidth)}%;height:${boundedPercent(top,bottom-top,pageHeight)}%`;
  const rowGap = Math.max(.35, Math.min(rowSize * .7, ((bottom - top) / pageHeight * 100 - titleSize * 2.2) / Math.max(1, effectiveEntries.length) - rowSize * 1.25));
  return `<nav class="digital-toc" style="${navStyle};color:${rowColor}" aria-labelledby="digital-toc-title"><h1 data-id="page-${page.number}-toc-title" id="digital-toc-title" style="text-align:${align};font-size:${titleSize.toFixed(2)}cqw;color:${titleColor};font-weight:${heading?.font?.weight ?? 700};margin-bottom:${Math.max(1.4,rowSize * 1.5).toFixed(2)}cqw">${escapeHtml(title)}</h1><ol style="gap:${rowGap.toFixed(2)}cqw">${effectiveEntries.map((entry, entryIndex) => {
    const source = bestTocSourceBlock(entry.title, rows);
    const sourceSize = Math.max(
      1.05,
      (((source?.font?.size ?? rowSizes.sort((a, b) => a - b)[Math.floor(rowSizes.length / 2)] ?? 12)) / pageWidth) * 100,
    );
    const sourceColor = safeColor(source?.font?.color ?? rowColor);
    const sourceWeight = /bold|black|heavy|semibold/i.test(
      `${source?.font?.weight ?? ""} ${source?.font?.name ?? ""}`,
    )
      ? 700
      : entry.level === 1
        ? 700
        : 400;
    return `<li data-id="page-${page.number}-toc-${entryIndex}" data-level="${entry.level}" style="gap:${Math.max(.45,sourceSize*.35).toFixed(2)}cqw;font-size:${sourceSize.toFixed(2)}cqw;font-weight:${sourceWeight};color:${sourceColor};padding-inline-start:${Math.max(0, entry.level - 1) * 1.7}cqw"><a href="#page-${entry.pageNumber}" onclick="parent.postMessage({type:'litera-open-page',pageNumber:${entry.pageNumber}},'*');return false"><span>${escapeHtml(entry.title.replace(/\s*\.{2,}\s*\d{1,4}\s*$/, ""))}</span><span class="dots" style="${usesLeaders ? "" : "border-color:transparent"}" aria-hidden="true"></span><span aria-label="Digital page ${entry.pageNumber}">${entry.pageNumber}</span></a></li>`;
  }).join("")}</ol></nav>`;
}

function inferSourceTocEntries(blocks: ExtractedLayoutBlock[]) {
  const ordered = [...blocks].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  );
  const entries: Array<{ title: string; pageNumber: number; level: number }> = [];
  let pendingChapter: string | undefined;
  for (const block of ordered) {
    const text = block.text?.replace(/\s+/g, " ").trim() ?? "";
    if (/^(?:chapter|sura|unit)\b/i.test(text) && !/\d\s*$/.test(text)) {
      pendingChapter = text;
      continue;
    }
    const match = text.match(
      /^(.{3,}?)\s*(?:\.{2,}|\s)\s*(\d{1,4}|[ivxlcdm]+)\s*$/i,
    );
    if (!match) continue;
    const printed = /^\d+$/.test(match[2]!)
      ? Number(match[2])
      : romanToNumber(match[2]!);
    if (!Number.isFinite(printed) || printed < 1) continue;
    if (pendingChapter) {
      entries.push({ title: pendingChapter, pageNumber: printed, level: 1 });
      pendingChapter = undefined;
    }
    const title = match[1]!.replace(/\.{2,}\s*$/, "").trim();
    if (title)
      entries.push({
        title,
        pageNumber: printed,
        level: /^(?:chapter|sura|unit)\b/i.test(title) ? 1 : 2,
      });
  }
  return entries;
}

function romanToNumber(value: string) {
  const weights: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  const letters = [...value.toLocaleLowerCase()];
  return letters.reduce((total, letter, index) => {
    const current = weights[letter] ?? 0;
    const next = weights[letters[index + 1] ?? ""] ?? 0;
    return total + (current < next ? -current : current);
  }, 0);
}

function bestTocSourceBlock(title: string, blocks: ExtractedLayoutBlock[]) {
  const tokens = (value: string) =>
    new Set(
      (value
        .replace(/\.{2,}\s*(?:\d{1,4}|[ivxlcdm]+)\s*$/i, "")
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter((token) => token.length > 1),
    );
  const wanted = tokens(title);
  if (!wanted.size) return undefined;
  return blocks
    .map((block) => {
      const candidate = tokens(block.text ?? "");
      const matches = [...wanted].filter((token) => candidate.has(token)).length;
      return {
        block,
        score: matches / Math.max(wanted.size, candidate.size),
        matches,
      };
    })
    .filter((item) => item.matches > 0)
    .sort((a, b) => b.score - a.score || b.matches - a.matches)[0]?.block;
}

function renderSourceFolio(
  page: GeometryPage,
  pageWidth: number,
  pageHeight: number,
  options: GeometryRenderOptions,
  pageSurface: string,
) {
  const digital = options.digitalPageNumber ?? page.number;
  const source = (page.layoutBlocks ?? [])
    .filter((block) => block.type === "text" && block.bbox.y >= pageHeight * .86 && /^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]+)(?:\s+of\s+\d{1,4})?$/i.test(block.text?.trim() ?? ""))
    .sort((a,b) => b.bbox.y - a.bbox.y)[0];
  if (!source) {
    const side = digital % 2 === 0 ? "left:5%;justify-content:flex-start" : "right:5%;justify-content:flex-end";
    return `<span class="source-folio source-folio--digital" aria-label="Digital page ${digital}" style="${side};bottom:2.2%;width:10%;height:3%;font-size:1.2cqw;color:#303030">${digital}</span>`;
  }
  const center = source.bbox.x + source.bbox.w / 2;
  const justify = center < pageWidth * .4 ? "flex-start" : center > pageWidth * .6 ? "flex-end" : "center";
  const sourceText = source.text?.trim() ?? "";
  const label = /^page\s+/i.test(sourceText)
    ? `Page ${digital}${/\s+of\s+/i.test(sourceText) && options.digitalPageCount ? ` of ${options.digitalPageCount}` : ""}`
    : String(digital);
  const size = Math.max(1.1, ((source.font?.size ?? source.bbox.h * .8) / pageWidth) * 100);
  const color = safeColor(source.font?.color ?? "#171717");
  const visibleColor = readableTextColor(color, pageSurface, 4.5);
  return `<span class="source-folio" aria-label="Digital page ${digital}" style="left:${percent(source.bbox.x,pageWidth)}%;top:${percent(source.bbox.y,pageHeight)}%;width:${boundedPercent(source.bbox.x,Math.max(source.bbox.w,pageWidth*.045),pageWidth)}%;height:${boundedPercent(source.bbox.y,source.bbox.h,pageHeight)}%;justify-content:${justify};font-size:${size.toFixed(2)}cqw;color:${visibleColor};text-shadow:0 .08cqw .18cqw rgba(255,255,255,.8)">${label}</span>`;
}

function isNonContentBlock(block: ExtractedLayoutBlock, pageHeight: number) {
  const value = block.text?.trim() ?? "";
  if (nonContentText.test(value)) return true;
  return (
    block.bbox.y >= pageHeight * 0.9 && /^(?:\d{1,4}|[ivxlcdm]+)$/i.test(value)
  );
}

function isTextualAnswerRule(block: ExtractedLayoutBlock) {
  const value = block.text?.trim() ?? "";
  return answerRuleMatches(value).length > 0;
}

function deduplicateAnswerRules(blocks: ExtractedLayoutBlock[]) {
  const kept: ExtractedLayoutBlock[] = [];
  for (const block of blocks) {
    const duplicate = kept.some(
      (candidate) =>
        normalizeText(candidate.text) === normalizeText(block.text) &&
        overlap(candidate, block) > 0.72,
    );
    if (!duplicate) kept.push(block);
  }
  return kept;
}

function deduplicateVisualAssets(assets: ExtractedPageAsset[]) {
  const kept: ExtractedPageAsset[] = [];
  for (const asset of [...assets].sort(
    (a, b) => b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h,
  )) {
    const duplicate = kept.some((candidate) => {
      const intersectionWidth = Math.max(
        0,
        Math.min(
          candidate.bounds.x + candidate.bounds.w,
          asset.bounds.x + asset.bounds.w,
        ) - Math.max(candidate.bounds.x, asset.bounds.x),
      );
      const intersectionHeight = Math.max(
        0,
        Math.min(
          candidate.bounds.y + candidate.bounds.h,
          asset.bounds.y + asset.bounds.h,
        ) - Math.max(candidate.bounds.y, asset.bounds.y),
      );
      const intersection = intersectionWidth * intersectionHeight;
      const smallerArea = Math.min(
        candidate.bounds.w * candidate.bounds.h,
        asset.bounds.w * asset.bounds.h,
      );
      const widthSimilarity =
        Math.min(candidate.bounds.w, asset.bounds.w) /
        Math.max(1, Math.max(candidate.bounds.w, asset.bounds.w));
      const heightSimilarity =
        Math.min(candidate.bounds.h, asset.bounds.h) /
        Math.max(1, Math.max(candidate.bounds.h, asset.bounds.h));
      const centerDistance = Math.hypot(
        candidate.bounds.x + candidate.bounds.w / 2 - asset.bounds.x - asset.bounds.w / 2,
        candidate.bounds.y + candidate.bounds.h / 2 - asset.bounds.y - asset.bounds.h / 2,
      );
      // A small illustration contained by a broad exercise/table composite is
      // not a duplicate. The old overlap-only test silently removed such
      // nested objects (the missing rows on arithmetic page 26). Suppress only
      // near-identical extractions of the same visual at the same placement.
      return (
        intersection / Math.max(1, smallerArea) > 0.72 &&
        widthSimilarity > 0.72 &&
        heightSimilarity > 0.72 &&
        centerDistance < Math.max(candidate.bounds.w, candidate.bounds.h) * 0.18
      );
    });
    if (!duplicate) kept.push(asset);
  }
  return kept.sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );
}

function buildImageNumberTableTargets(
  assets: ExtractedPageAsset[],
  textBlocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const instruction = textBlocks
    .map((block) => block.text ?? "")
    .join(" ");
  const numberHeader = textBlocks.find((block) =>
    /^(?:number|namba)$/i.test(block.text?.trim() ?? ""),
  );
  if (
    !numberHeader ||
    !/\b(?:count|hesabu)\b[\s\S]{0,100}\b(?:write|andika)\b/i.test(
      instruction,
    )
  )
    return [];
  const columnLeft = numberHeader.bbox.x;
  const rowAssets = assets.filter((asset) => {
    const areaRatio =
      (asset.bounds.w * asset.bounds.h) / (pageWidth * pageHeight);
    return (
      areaRatio >= 0.0007 &&
      areaRatio < 0.18 &&
      asset.bounds.y >
        numberHeader.bbox.y + numberHeader.bbox.h - pageHeight * 0.01 &&
      asset.bounds.y + asset.bounds.h < pageHeight * 0.91 &&
      asset.bounds.x + asset.bounds.w <= columnLeft + pageWidth * 0.025
    );
  });
  const rows: ExtractedPageAsset[][] = [];
  for (const asset of [...rowAssets].sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  )) {
    const centerY = asset.bounds.y + asset.bounds.h / 2;
    const row = rows.find((candidate) => {
      const sample = candidate[0]!.bounds;
      const sampleCenter = sample.y + sample.h / 2;
      return (
        Math.abs(sampleCenter - centerY) <=
        Math.max(pageHeight * 0.024, sample.h * 0.42, asset.bounds.h * 0.42)
      );
    });
    if (row) row.push(asset);
    else rows.push([asset]);
  }
  if (rows.length < 3) return [];
  return rows.map((row, index) => {
    const top = Math.min(...row.map((asset) => asset.bounds.y));
    const bottom = Math.max(
      ...row.map((asset) => asset.bounds.y + asset.bounds.h),
    );
    return {
      type: "text" as const,
      text: "Image table row " + (index + 1),
      confidence: 0.97,
      evidence: "image-number-table",
      bbox: {
        x: columnLeft + pageWidth * 0.018,
        y: top + Math.max(0, (bottom - top - pageHeight * 0.04) / 2),
        w: Math.max(
          pageWidth * 0.07,
          Math.min(
            pageWidth * 0.12,
            pageWidth - columnLeft - pageWidth * 0.055,
          ),
        ),
        h: Math.max(
          pageHeight * 0.034,
          Math.min(pageHeight * 0.055, bottom - top),
        ),
      },
    };
  });
}

function buildRepeatedAnswerBoxTargets({
  assets,
  textBlocks,
  pageWidth,
  pageHeight,
  activityPage,
}: {
  assets: ExtractedPageAsset[];
  textBlocks: ExtractedLayoutBlock[];
  pageWidth: number;
  pageHeight: number;
  activityPage: boolean;
}) {
  const pageInstruction = textBlocks.map((block) => block.text ?? "").join(" ");
  if (
    !activityPage ||
    !/\b(?:write|fill|complete|answer|andika|jaza)\b/i.test(pageInstruction)
  )
    return [];
  const lastActivityHeading = textBlocks
    .filter((block) => activityHeadingPattern.test(block.text?.trim() ?? ""))
    .sort((a, b) => b.bbox.y - a.bbox.y)[0];
  const activityStart = lastActivityHeading
    ? lastActivityHeading.bbox.y + lastActivityHeading.bbox.h
    : pageHeight * 0.14;
  const candidates = assets.filter(({ bounds }) => {
    const widthRatio = bounds.w / pageWidth;
    const heightRatio = bounds.h / pageHeight;
    return (
      widthRatio >= 0.05 &&
      widthRatio <= 0.28 &&
      heightRatio >= 0.025 &&
      heightRatio <= 0.09 &&
      bounds.y > Math.max(pageHeight * 0.14, activityStart) &&
      bounds.y + bounds.h < pageHeight * 0.9
    );
  });
  const groups = candidates.reduce<ExtractedPageAsset[][]>((output, asset) => {
    const group = output.find((items) => {
      const sample = items[0]!.bounds;
      return (
        Math.abs(sample.w - asset.bounds.w) <= pageWidth * 0.025 &&
        Math.abs(sample.h - asset.bounds.h) <= pageHeight * 0.018
      );
    });
    if (group) group.push(asset);
    else output.push([asset]);
    return output;
  }, []);
  const repeated = groups.sort((a, b) => b.length - a.length)[0] ?? [];
  if (repeated.length < 3) return [];
  const numberWords: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  return [...repeated]
    .sort((a, b) => a.bounds.y - b.bounds.y)
    .map((asset) => {
      const label = textBlocks
        .filter((block) => {
          const centerY = block.bbox.y + block.bbox.h / 2;
          return (
            block.bbox.x + block.bbox.w <= asset.bounds.x + pageWidth * 0.04 &&
            Math.abs(centerY - (asset.bounds.y + asset.bounds.h / 2)) <=
              Math.max(asset.bounds.h, pageHeight * 0.025)
          );
        })
        .sort(
          (a, b) =>
            asset.bounds.x - (a.bbox.x + a.bbox.w) -
            (asset.bounds.x - (b.bbox.x + b.bbox.w)),
        )[0]?.text
        ?.trim()
        .toLocaleLowerCase();
      return {
        type: "image" as const,
        text: label,
        confidence: 0.94,
        evidence: "repeated-printed-answer-box",
        correctAnswer: label ? numberWords[label] : undefined,
        bbox: { ...asset.bounds },
      };
    });
}

function buildRepeatedVectorAnswerBoxTargets({
  layoutBlocks,
  textBlocks,
  pageWidth,
  pageHeight,
  activityPage,
}: {
  layoutBlocks: ExtractedLayoutBlock[];
  textBlocks: ExtractedLayoutBlock[];
  pageWidth: number;
  pageHeight: number;
  activityPage: boolean;
}) {
  const instruction = textBlocks.map((block) => block.text ?? "").join(" ");
  if (
    !activityPage ||
    !/\b(?:write|fill|complete|answer|andika|jaza)\b/i.test(instruction)
  )
    return [];
  const horizontal = layoutBlocks.filter(
    (block) =>
      block.type === "image" &&
      block.bbox.w / pageWidth >= 0.05 &&
      block.bbox.w / pageWidth <= 0.3 &&
      block.bbox.h <= Math.max(3, pageHeight * 0.006),
  );
  const vertical = layoutBlocks.filter(
    (block) =>
      block.type === "image" &&
      block.bbox.h / pageHeight >= 0.025 &&
      block.bbox.h / pageHeight <= 0.1 &&
      block.bbox.w <= Math.max(3, pageWidth * 0.006),
  );
  const toleranceX = pageWidth * 0.012;
  const toleranceY = pageHeight * 0.009;
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const top of horizontal) {
    const bottom = horizontal
      .filter(
        (candidate) =>
          candidate.bbox.y > top.bbox.y + pageHeight * 0.02 &&
          candidate.bbox.y - top.bbox.y <= pageHeight * 0.1 &&
          Math.abs(candidate.bbox.x - top.bbox.x) <= toleranceX &&
          Math.abs(candidate.bbox.w - top.bbox.w) <= toleranceX,
      )
      .sort((a, b) => a.bbox.y - b.bbox.y)[0];
    if (!bottom) continue;
    const height = bottom.bbox.y - top.bbox.y;
    const left = vertical.some(
      (candidate) =>
        Math.abs(candidate.bbox.x - top.bbox.x) <= toleranceX &&
        Math.abs(candidate.bbox.y - top.bbox.y) <= toleranceY &&
        Math.abs(candidate.bbox.h - height) <= toleranceY * 2,
    );
    const rightX = top.bbox.x + top.bbox.w;
    const right = vertical.some(
      (candidate) =>
        Math.abs(candidate.bbox.x - rightX) <= toleranceX &&
        Math.abs(candidate.bbox.y - top.bbox.y) <= toleranceY &&
        Math.abs(candidate.bbox.h - height) <= toleranceY * 2,
    );
    if (!left || !right) continue;
    const box = { x: top.bbox.x, y: top.bbox.y, w: top.bbox.w, h: height };
    if (!boxes.some((candidate) => rectangleIoU(candidate, box) > 0.7))
      boxes.push(box);
  }
  const answerBoxes = boxes.filter((box) =>
    !textBlocks.some((block) => {
      const text = block.text?.replace(/\s+/g, " ").trim();
      if (!text) return false;
      const centerX = block.bbox.x + block.bbox.w / 2;
      const centerY = block.bbox.y + block.bbox.h / 2;
      return (
        centerX >= box.x &&
        centerX <= box.x + box.w &&
        centerY >= box.y &&
        centerY <= box.y + box.h
      );
    }),
  );
  const equalsAnchored = textBlocks
    .filter((block) => /^(?:=|equals)$/i.test(block.text?.trim() ?? ""))
    .map((equalsBlock) => {
      const equalsCenterY = equalsBlock.bbox.y + equalsBlock.bbox.h / 2;
      const box = answerBoxes
        .filter((box) =>
          box.x > equalsBlock.bbox.x + equalsBlock.bbox.w &&
          Math.abs(box.y + box.h / 2 - equalsCenterY) <= pageHeight * .03,
        )
        .sort((a, b) => a.x - b.x)[0];
      return box ? { box, equalsBlock } : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item, index, items) =>
      items.findIndex((candidate) => rectangleIoU(candidate.box, item.box) > .72) === index,
    );
  if (equalsAnchored.length >= 2) {
    return equalsAnchored
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
      .map(({ box, equalsBlock }) => {
        const rowText = textBlocks
          .filter((candidate) => {
            const candidateCenter = candidate.bbox.y + candidate.bbox.h / 2;
            const equalsCenter = equalsBlock.bbox.y + equalsBlock.bbox.h / 2;
            return (
              candidate.bbox.x <= equalsBlock.bbox.x + equalsBlock.bbox.w &&
              Math.abs(candidateCenter - equalsCenter) <= pageHeight * .026
            );
          })
          .sort((a, b) => a.bbox.x - b.bbox.x)
          .map((candidate) => candidate.text?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        const rowNumbers = [...rowText.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(
          (match) => Number(match[0]),
        );
        const operationAnswer =
          /\b(?:take\s+away|remain|subtract|minus)\b/i.test(instruction) &&
          rowNumbers.length >= 2
            ? String(rowNumbers[0]! - rowNumbers[1]!)
            : undefined;
        return {
          type: "image" as const,
          text: rowText,
          confidence: .99,
          evidence: "equals-anchored-answer-box",
          correctAnswer: inferCorrectAnswers(rowText)[0] ?? operationAnswer,
          bbox: box,
        };
      });
  }
  const groups = answerBoxes.reduce<Array<typeof answerBoxes>>((output, box) => {
    const group = output.find((items) => {
      const sample = items[0]!;
      return (
        Math.abs(sample.w - box.w) <= pageWidth * 0.025 &&
        Math.abs(sample.h - box.h) <= pageHeight * 0.018
      );
    });
    if (group) group.push(box);
    else output.push([box]);
    return output;
  }, []);
  const operationGrid = /\b(?:take\s+away|remain|subtract|minus|equals)\b/i.test(instruction);
  const repeated = groups
    .filter((group) => group.length >= 3)
    .sort((a, b) =>
      operationGrid
        ? median(b.map((box) => box.x + box.w / 2)) -
          median(a.map((box) => box.x + box.w / 2))
        : median(a.map((box) => box.w * box.h)) -
          median(b.map((box) => box.w * box.h)),
    )[0] ?? [];
  if (repeated.length < 3) return [];
  const numberWords: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  return repeated
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((box) => {
      const label = textBlocks
        .filter((block) => {
          const centerY = block.bbox.y + block.bbox.h / 2;
          return (
            block.bbox.x + block.bbox.w <= box.x + pageWidth * 0.04 &&
            Math.abs(centerY - (box.y + box.h / 2)) <=
              Math.max(box.h, pageHeight * 0.025)
          );
        })
        .sort(
          (a, b) =>
            box.x - (a.bbox.x + a.bbox.w) -
            (box.x - (b.bbox.x + b.bbox.w)),
        )[0]?.text
        ?.trim()
        .toLocaleLowerCase();
      return {
        type: "image" as const,
        text: label,
        confidence: 0.96,
        evidence: "repeated-vector-answer-box",
        correctAnswer: label ? numberWords[label] : undefined,
        bbox: box,
      };
    });
}

export function suppressTableGridRules(
  candidates: ExtractedLayoutBlock[],
  assets: ExtractedPageAsset[],
  textBlocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const remaining = new Set(candidates);
  const rows: ExtractedLayoutBlock[][] = [];
  for (const candidate of candidates) {
    const row = rows.find(
      (items) =>
        Math.abs(items[0]!.bbox.y - candidate.bbox.y) <= pageHeight * 0.012,
    );
    if (row) row.push(candidate);
    else rows.push([candidate]);
  }
  for (const row of rows) {
    if (row.length < 4) continue;
    const byWidth = [...row].sort((a, b) => a.bbox.w - b.bbox.w);
    let split = -1;
    let largestGap = 1;
    for (let index = 0; index < byWidth.length - 1; index += 1) {
      const ratio = byWidth[index + 1]!.bbox.w / Math.max(1, byWidth[index]!.bbox.w);
      if (ratio > largestGap) {
        largestGap = ratio;
        split = index;
      }
    }
    // Exercise tables often expose both their long cell borders and shorter
    // printed answer rules as thin PDF image blocks. Keep the short cluster
    // only when the source geometry contains a clear size separation.
    if (split >= 1 && largestGap >= 1.35) {
      const likelyAnswers = new Set(byWidth.slice(0, split + 1));
      row.forEach((candidate) => {
        if (!likelyAnswers.has(candidate)) remaining.delete(candidate);
      });
    }
  }
  const geometric = candidates.filter((candidate) => remaining.has(candidate));
  if (geometric.length < 4) return geometric;
  const nonOperatorColumns = geometric.filter((rule) => {
    const centerX = rule.bbox.x + rule.bbox.w / 2;
    return !textBlocks.some((block) => {
      const text = block.text?.trim() ?? "";
      const textCenterX = block.bbox.x + block.bbox.w / 2;
      return (
        /^(?:add|equals|[+=])$/i.test(text) &&
        block.bbox.y < rule.bbox.y &&
        rule.bbox.y - (block.bbox.y + block.bbox.h) <= pageHeight * 0.22 &&
        Math.abs(textCenterX - centerX) <=
          Math.max(rule.bbox.w * 0.42, pageWidth * 0.025)
      );
    });
  });
  if (
    nonOperatorColumns.length >= 2 &&
    nonOperatorColumns.length <= 4 &&
    nonOperatorColumns.length < geometric.length
  )
    return nonOperatorColumns;
  const lastActivityHeading = textBlocks
    .filter((block) => activityHeadingPattern.test(block.text?.trim() ?? ""))
    .sort((a, b) => b.bbox.y - a.bbox.y)[0];
  const activityTop = lastActivityHeading?.bbox.y ?? 0;
  const imageBacked = geometric.filter((rule) => {
    const centerX = rule.bbox.x + rule.bbox.w / 2;
    return assets.some((asset) => {
      const areaRatio =
        (asset.bounds.w * asset.bounds.h) / (pageWidth * pageHeight);
      return (
        areaRatio >= 0.001 &&
        areaRatio < 0.16 &&
        asset.bounds.y >= activityTop &&
        asset.bounds.y + asset.bounds.h <= rule.bbox.y + pageHeight * 0.01 &&
        rule.bbox.y - (asset.bounds.y + asset.bounds.h) <= pageHeight * 0.22 &&
        centerX >= asset.bounds.x - pageWidth * 0.025 &&
        centerX <= asset.bounds.x + asset.bounds.w + pageWidth * 0.025
      );
    });
  });
  // In illustrated arithmetic tables, operands and the result have pictures
  // above their answer boxes; operator/grid columns do not. This relationship
  // is more reliable than treating every extracted horizontal cell edge as an
  // answer rule.
  return imageBacked.length >= 2 && imageBacked.length <= 4
    ? imageBacked
    : geometric;
}

function buildNumberedVisualAnswerTargets({
  assets,
  textBlocks,
  existingTargets,
  pageWidth,
  pageHeight,
  activityPage,
}: {
  assets: ExtractedPageAsset[];
  textBlocks: ExtractedLayoutBlock[];
  existingTargets: Array<{
    type: "text";
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
  }>;
  pageWidth: number;
  pageHeight: number;
  activityPage: boolean;
}) {
  const numberLabels = textBlocks.filter((block) =>
    /^\(?\d{1,2}\)?[.)]?$/.test(block.text?.trim() ?? ""),
  );
  if (!activityPage || assets.length < 2) return [];
  const claimedNumbers = new Set<ExtractedLayoutBlock>();
  const targets: Array<{
    type: "image";
    text: undefined;
    bbox: { x: number; y: number; w: number; h: number };
  }> = [];
  for (const asset of [...assets].sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  )) {
    const availableNumbers = numberLabels
      .filter((block) => !claimedNumbers.has(block))
      .map((block) => ({
        block,
        distance: Math.hypot(
          block.bbox.x + block.bbox.w / 2 - asset.bounds.x,
          block.bbox.y + block.bbox.h / 2 - asset.bounds.y,
        ),
      }));
    const number =
      availableNumbers
        .filter(
          ({ block }) =>
            block.bbox.x >= asset.bounds.x - pageWidth * 0.055 &&
            block.bbox.x <= asset.bounds.x + asset.bounds.w &&
            block.bbox.y >= asset.bounds.y - pageHeight * 0.04 &&
            block.bbox.y <= asset.bounds.y + asset.bounds.h * 0.45,
        )
        .sort((a, b) => a.distance - b.distance)[0]?.block;
    // Do not attach a distant numbered question to an unrelated diagram.
    // This was particularly damaging on continuation pages where (a)-(d)
    // fraction diagrams sit above questions 7-12.
    if (!number) continue;
    claimedNumbers.add(number);
    const hasPrintedResponse = existingTargets.some((target) => {
      const centerX = target.bbox.x + target.bbox.w / 2;
      return (
        centerX >= asset.bounds.x - pageWidth * 0.025 &&
        centerX <= asset.bounds.x + asset.bounds.w + pageWidth * 0.025 &&
        target.bbox.y >= asset.bounds.y &&
        target.bbox.y <= asset.bounds.y + asset.bounds.h + pageHeight * 0.11
      );
    });
    if (hasPrintedResponse) continue;
    const captionBelow = textBlocks
      .filter((block) => {
        const centerX = block.bbox.x + block.bbox.w / 2;
        return (
          centerX >= asset.bounds.x - pageWidth * 0.02 &&
          centerX <= asset.bounds.x + asset.bounds.w + pageWidth * 0.02 &&
          block.bbox.y >= asset.bounds.y + asset.bounds.h &&
          block.bbox.y <= asset.bounds.y + asset.bounds.h + pageHeight * 0.08 &&
          !/^\(?\d{1,2}\)?[.)]?$/.test(block.text?.trim() ?? "")
        );
      })
      .sort((a, b) => a.bbox.y - b.bbox.y)[0];
    const y = Math.min(
      pageHeight - Math.max(18, pageHeight * 0.03),
      (captionBelow
        ? captionBelow.bbox.y + captionBelow.bbox.h
        : asset.bounds.y + asset.bounds.h) +
        pageHeight * 0.006,
    );
    const inset = Math.min(asset.bounds.w * 0.08, pageWidth * 0.012);
    targets.push({
      type: "image",
      text: undefined,
      bbox: {
        x: Math.max(0, asset.bounds.x + inset),
        y,
        w: Math.min(
          pageWidth - asset.bounds.x - inset,
          Math.max(pageWidth * 0.09, asset.bounds.w - inset * 2),
        ),
        h: Math.max(18, pageHeight * 0.03),
      },
    });
  }
  return targets;
}

function safeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}
function readableTextColor(
  foreground: string,
  background: string,
  minimum: number,
) {
  if (contrastRatio(foreground, background) >= minimum) return foreground;
  const [red, green, blue] = hexChannels(foreground);
  for (let factor = 0.88; factor >= 0.18; factor -= 0.08) {
    const candidate = `#${[red, green, blue]
      .map((channel) =>
        Math.round(channel * factor)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return contrastRatio("#171717", background) >=
    contrastRatio("#ffffff", background)
    ? "#171717"
    : "#ffffff";
}
function contrastRatio(a: string, b: string) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
function relativeLuminance(value: string) {
  const channels = hexChannels(value)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function hexChannels(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}
function isLightColor(value?: string) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return false;
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 >= 185;
}
function boundsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const width = Math.max(
    0,
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  );
  return (width * height) / Math.max(1, b.w * b.h);
}

function rectanglesIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  tolerance = 0,
) {
  return !(
    b.x + b.w < a.x - tolerance ||
    b.x > a.x + a.w + tolerance ||
    b.y + b.h < a.y - tolerance ||
    b.y > a.y + a.h + tolerance
  );
}

function ruleDuplicatesPanelEdge(
  rule: { x: number; y: number; w: number; h: number },
  panel: { x: number; y: number; w: number; h: number },
  pageWidth: number,
  pageHeight: number,
) {
  const horizontal = rule.h <= Math.max(2.5, pageHeight * 0.004);
  const vertical = rule.w <= Math.max(2.5, pageWidth * 0.004);
  // PDF authoring tools often emit the same rounded panel edge as several
  // nearby line fragments. Use a generous edge tolerance so the inferred
  // single panel does not acquire two or three ghost outlines.
  const toleranceX = pageWidth * 0.1;
  const toleranceY = pageHeight * 0.032;
  const horizontalOverlap =
    Math.min(rule.x + rule.w, panel.x + panel.w) -
    Math.max(rule.x, panel.x);
  const verticalOverlap =
    Math.min(rule.y + rule.h, panel.y + panel.h) -
    Math.max(rule.y, panel.y);
  return (
    (horizontal &&
      horizontalOverlap >= Math.min(rule.w, panel.w) * 0.45 &&
      (Math.abs(rule.y - panel.y) <= toleranceY ||
        Math.abs(rule.y - (panel.y + panel.h)) <= toleranceY)) ||
    (vertical &&
      verticalOverlap >= Math.min(rule.h, panel.h) * 0.45 &&
      (Math.abs(rule.x - panel.x) <= toleranceX ||
        Math.abs(rule.x - (panel.x + panel.w)) <= toleranceX))
  );
}

function buildStackedArithmeticCellTargets(
  textBlocks: ExtractedLayoutBlock[],
  layoutBlocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const labels = textBlocks
    .filter((block) => /^\d{1,2}[.)]$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  if (labels.length < 4) return [];
  const rules = layoutBlocks.filter(
    (block) =>
      block.type === "image" &&
      block.bbox.w / pageWidth >= 0.07 &&
      block.bbox.w / pageWidth <= 0.32 &&
      block.bbox.h / pageHeight <= 0.012,
  );
  const targets: Array<{
    type: "image";
    text?: undefined;
    confidence: number;
    evidence: string;
    bbox: ExtractedLayoutBlock["bbox"];
  }> = [];
  for (const label of labels) {
    const sameRowRight = labels
      .filter(
        (candidate) =>
          candidate.bbox.x > label.bbox.x &&
          Math.abs(candidate.bbox.y - label.bbox.y) < pageHeight * 0.025,
      )
      .sort((a, b) => a.bbox.x - b.bbox.x)[0];
    const nextRow = labels
      .filter(
        (candidate) =>
          candidate.bbox.y > label.bbox.y + pageHeight * 0.025 &&
          Math.abs(candidate.bbox.x - label.bbox.x) < pageWidth * 0.08,
      )
      .sort((a, b) => a.bbox.y - b.bbox.y)[0];
    const left = label.bbox.x - pageWidth * 0.01;
    const right = sameRowRight
      ? sameRowRight.bbox.x - pageWidth * 0.025
      : Math.min(pageWidth * 0.96, left + pageWidth * 0.28);
    const bottom = nextRow
      ? nextRow.bbox.y - pageHeight * 0.018
      : Math.min(pageHeight * 0.93, label.bbox.y + pageHeight * 0.16);
    const candidates = rules
      .filter((rule) => {
        const centerX = rule.bbox.x + rule.bbox.w / 2;
        return (
          centerX >= left &&
          centerX <= right &&
          rule.bbox.y > label.bbox.y + label.bbox.h &&
          rule.bbox.y < bottom
        );
      })
      .sort((a, b) => b.bbox.y - a.bbox.y);
    const resultRule = candidates[0];
    if (!resultRule) continue;
    targets.push({
      type: "image",
      text: undefined,
      confidence: 0.94,
      evidence: "printed-writing-rule",
      bbox: resultRule.bbox,
    });
  }
  return targets;
}

function alignRepeatedAnswerBoxesToLabels<
  Target extends {
    text?: string;
    bbox: { x: number; y: number; w: number; h: number };
    evidence: string;
  },
>(targets: Target[], textBlocks: ExtractedLayoutBlock[], pageHeight: number) {
  const numberWord = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)$/i;
  const labels = textBlocks
    .filter((block) => numberWord.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y);
  const repeated = targets
    .filter((target) => target.evidence === "repeated-printed-answer-box")
    .sort((a, b) => a.bbox.y - b.bbox.y);
  if (labels.length < 3 || repeated.length < 3) return targets;
  return targets.map((target) => {
    if (target.evidence !== "repeated-printed-answer-box") return target;
    const label = target.text
      ? labels.find((candidate) => candidate.text?.trim().toLocaleLowerCase() === target.text?.trim().toLocaleLowerCase())
      : labels[repeated.indexOf(target)];
    if (!label) return target;
    const alignedY = label.bbox.y + label.bbox.h / 2 - target.bbox.h / 2;
    if (Math.abs(alignedY - target.bbox.y) > pageHeight * .055) return target;
    return { ...target, bbox: { ...target.bbox, y: alignedY } };
  });
}

function validateAnswerTargets<
  Target extends {
    bbox: { x: number; y: number; w: number; h: number };
    confidence: number;
    evidence: string;
  },
>(
  targets: Target[],
  textBlocks: ExtractedLayoutBlock[],
  assets: ExtractedPageAsset[],
  pageWidth: number,
  pageHeight: number,
  panels: Array<{ x: number; y: number; w: number; h: number }> = [],
) {
  const accepted: Target[] = [];
  for (const target of targets) {
    let bbox = target.bbox;
    const centerY = bbox.y + bbox.h / 2;
    const owner = panels.find(
      (panel) =>
        centerY >= panel.y &&
        centerY <= panel.y + panel.h &&
        bbox.x >= panel.x - pageWidth * 0.015 &&
        bbox.x <= panel.x + panel.w + pageWidth * 0.015,
    );
    if (owner) {
      const safeRight = owner.x + owner.w - pageWidth * 0.01;
      const safeLeft = owner.x + pageWidth * 0.01;
      const minimumWidth = pageWidth * 0.025;
      const fittedWidth = Math.max(
        minimumWidth,
        Math.min(bbox.w, safeRight - Math.max(bbox.x, safeLeft)),
      );
      bbox = {
        ...bbox,
        x: Math.max(safeLeft, Math.min(bbox.x, safeRight - fittedWidth)),
        w: fittedWidth,
      };
    }
    const insideTrim =
      bbox.x >= pageWidth * 0.015 &&
      bbox.y >= pageHeight * 0.04 &&
      bbox.x + bbox.w <= pageWidth * 0.985 &&
      bbox.y + bbox.h <= pageHeight * 0.94;
    if (!insideTrim || bbox.w <= 0 || bbox.h <= 0) continue;
    const collidesWithInk = (candidate: typeof bbox) =>
      target.evidence !== "numbered-prose-question" &&
      textBlocks.some(
        (block) =>
          block.text?.trim() !== "=" &&
          intersectionRatio(candidate, block.bbox) > 0.12,
      );
    // A printed-writing-rule target is derived from the source rule itself.
    // Native PDF extraction may also expose that same rule as a tiny image
    // asset, which must not veto the control. Other inferred targets still
    // abstain when they collide with meaningful artwork.
    const collidesWithPicture = (candidate: typeof bbox) =>
      target.evidence !== "printed-writing-rule" &&
      target.evidence !== "repeated-printed-answer-box" &&
      assets.some((asset) => {
        // Page panels, watermarks, and broad composed backgrounds are not
        // figures. Protect bounded visual objects while ignoring those
        // page-scale extraction artefacts, otherwise continuation-page answer
        // lines (such as the prose questions below a diagram) are discarded.
        const areaRatio = (asset.bounds.w * asset.bounds.h) / (pageWidth * pageHeight);
        const boundedFigure =
          areaRatio >= .0008 &&
          areaRatio < .3 &&
          asset.bounds.w < pageWidth * .88 &&
          asset.bounds.h < pageHeight * .48;
        return boundedFigure && intersectionRatio(candidate, asset.bounds) > 0.035;
      });
    if (collidesWithInk(bbox) || collidesWithPicture(bbox)) {
      // Inferred controls must not simply disappear when their first
      // placement touches a figure or a neighbouring prompt. Search the
      // question's own panel from the proposed baseline downward and keep
      // the first clear writing slot. Source-backed printed rules/boxes are
      // never moved because their geometry is authoritative.
      const canRelocate = /^(?:semantically-aligned-whitespace|labelled-question-item|numbered-prose-question)$/.test(
        target.evidence,
      );
      const searchBottom = owner
        ? owner.y + owner.h - pageHeight * 0.012
        : Math.min(pageHeight * 0.94, bbox.y + pageHeight * 0.13);
      const step = Math.max(pageHeight * 0.008, bbox.h * 0.5);
      let relocated: typeof bbox | undefined;
      if (canRelocate) {
        for (
          let y = bbox.y + step;
          y + bbox.h <= searchBottom;
          y += step
        ) {
          const candidate = { ...bbox, y };
          if (
            !collidesWithInk(candidate) &&
            !collidesWithPicture(candidate) &&
            !accepted.some((prior) => rectangleIoU(prior.bbox, candidate) > 0.35)
          ) {
            relocated = candidate;
            break;
          }
        }
      }
      if (!relocated) continue;
      bbox = relocated;
    }
    const duplicate = accepted.some(
      (candidate) => rectangleIoU(candidate.bbox, bbox) > 0.55,
    );
    if (duplicate) continue;
    accepted.push({ ...target, bbox });
  }
  return accepted;
}

function intersectionRatio(
  candidate: { x: number; y: number; w: number; h: number },
  ink: { x: number; y: number; w: number; h: number },
) {
  const width = Math.max(
    0,
    Math.min(candidate.x + candidate.w, ink.x + ink.w) -
      Math.max(candidate.x, ink.x),
  );
  const height = Math.max(
    0,
    Math.min(candidate.y + candidate.h, ink.y + ink.h) -
      Math.max(candidate.y, ink.y),
  );
  return (width * height) / Math.max(1, candidate.w * candidate.h);
}

function rectangleIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const width = Math.max(
    0,
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  );
  const intersection = width * height;
  return (
    intersection /
    Math.max(1, a.w * a.h + b.w * b.h - intersection)
  );
}

/** Litera-style fixed-layout safety renderer. It keeps the source page visually
 * exact while retaining an ordered semantic text layer for assistive tech. */
export function createFacsimileStoryboardHtml(
  page: GeometryPage,
  pageImageUrl: string,
  includeAnswerInputs = false,
) {
  const width = Math.max(1, page.width ?? 612);
  const height = Math.max(1, page.height ?? 792);
  const blocks = deduplicateTextBlocks(
    (page.layoutBlocks ?? []).filter(
      (block) =>
        block.type === "text" &&
        block.text?.trim() &&
        !nonContentText.test(block.text),
    ),
  );
  const semantics = blocks
    .map((block, index) => {
      const size = block.font?.size ?? 11;
      const tag = size >= 22 ? "h1" : size >= 15 ? "h2" : "p";
      return `<${tag} data-layout-block="${index}" data-source-bounds="${block.bbox.x},${block.bbox.y},${block.bbox.w},${block.bbox.h}">${escapeHtml(block.text!)}</${tag}>`;
    })
    .join("");
  const answers = includeAnswerInputs
    ? blocks
        .filter((block) => /(?:\.{3,}|_{3,}|-{3,})/.test(block.text ?? ""))
        .map((block, index) => {
          const left = Math.max(0, (block.bbox.x / width) * 100);
          const top = Math.max(0, (block.bbox.y / height) * 100);
          const inputWidth = Math.min(
            34,
            Math.max(10, (block.bbox.w / width) * 45),
          );
          const inputHeight = Math.min(
            5,
            Math.max(2.4, (block.bbox.h / height) * 115),
          );
          return `<label class="litera-answer" style="left:${left + Math.min(12, (block.bbox.w / width) * 42)}%;top:${top}%;width:${inputWidth}%;height:${inputHeight}%"><span>Answer ${index + 1}</span><input aria-label="Answer ${index + 1}: ${escapeHtml(block.text ?? "")}" autocomplete="off"></label>`;
        })
        .join("")
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;min-height:100%;background:#e9eaec}body{display:flex;justify-content:center;align-items:flex-start}main[data-litera-page]{container-type:inline-size;width:100%;aspect-ratio:${width}/${height};position:relative;background:#fff;overflow:hidden}.litera-facsimile{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.litera-semantics,.litera-answer>span{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.litera-answer{position:absolute;z-index:2}.litera-answer input{box-sizing:border-box;width:100%;height:100%;min-height:1.5rem;border:0;border-bottom:2px dashed #3354a5;background:rgba(255,255,255,.92);font:600 clamp(12px,2cqw,22px)/1.1 system-ui;color:#172554;outline:none}.litera-answer input:focus{border:2px solid #2563eb;border-radius:.3rem;box-shadow:0 0 0 3px rgba(37,99,235,.25)}</style></head><body><main data-litera-page aria-label="Accessible facsimile of book page ${page.number}"><img class="litera-facsimile" src="${pageImageUrl}" alt=""><article class="litera-semantics">${semantics}</article>${answers}</main></body></html>`;
}

export function isStoryboardNoise(value: string) {
  return nonContentText.test(value);
}
function deduplicateTextBlocks(blocks: ExtractedLayoutBlock[]) {
  const kept: ExtractedLayoutBlock[] = [];
  const repaired = blocks.map((block) => {
    const displaySized = (block.font?.size ?? 0) >= 14 || block.bbox.h >= 16;
    if (!displaySized || !block.text) return block;
    const text = collapseRepeatedDisplayText(block.text);
    return text === block.text ? block : { ...block, text };
  });
  for (const block of repaired.sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x || b.bbox.w - a.bbox.w,
  )) {
    const duplicateIndex = kept.findIndex((candidate) => {
      const sameText =
        normalizeText(candidate.text) === normalizeText(block.text);
      const longLineDuplicate =
        sameText &&
        normalizeText(block.text).length > 8 &&
        Math.abs(candidate.bbox.y - block.bbox.y) <
          Math.max(candidate.bbox.h, block.bbox.h) * 2;
      const nearbyDuplicate =
        sameText &&
        normalizeText(block.text).length > 2 &&
        Math.abs(candidate.bbox.x - block.bbox.x) <
          Math.max(candidate.bbox.w, block.bbox.w) * 0.55 &&
        Math.abs(candidate.bbox.y - block.bbox.y) <
          Math.max(candidate.bbox.h, block.bbox.h) * 1.5;
      const layeredDisplayDuplicate =
        sameText &&
        normalizeText(block.text).length > 3 &&
        Math.min(candidate.font?.size ?? candidate.bbox.h, block.font?.size ?? block.bbox.h) >= 13 &&
        Math.abs(candidate.bbox.x + candidate.bbox.w / 2 - block.bbox.x - block.bbox.w / 2) <
          Math.max(candidate.bbox.w, block.bbox.w) * 0.38 &&
        Math.abs(candidate.bbox.y + candidate.bbox.h / 2 - block.bbox.y - block.bbox.h / 2) <
          Math.max(candidate.bbox.h, block.bbox.h) * 3.25;
      return (
        longLineDuplicate ||
        nearbyDuplicate ||
        layeredDisplayDuplicate ||
        (overlap(candidate, block) > 0.72 &&
          Math.abs(candidate.bbox.y - block.bbox.y) <
            Math.max(2, Math.min(candidate.bbox.h, block.bbox.h) * 0.35))
      );
    });
    if (duplicateIndex < 0) {
      kept.push(block);
      continue;
    }
    const candidate = kept[duplicateIndex]!;
    if (blockScore(block) > blockScore(candidate)) kept[duplicateIndex] = block;
  }
  return kept;
}
function normalizeText(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function blockScore(block: ExtractedLayoutBlock) {
  const colored =
    block.font?.color &&
    block.font.color.toLowerCase() !== "#171717" &&
    block.font.color.toLowerCase() !== "#000000"
      ? 1_000_000
      : 0;
  return (
    colored + (block.text?.length ?? 0) * 1_000 + block.bbox.w * block.bbox.h
  );
}
function overlap(a: ExtractedLayoutBlock, b: ExtractedLayoutBlock) {
  const left = Math.max(a.bbox.x, b.bbox.x);
  const top = Math.max(a.bbox.y, b.bbox.y);
  const right = Math.min(a.bbox.x + a.bbox.w, b.bbox.x + b.bbox.w);
  const bottom = Math.min(a.bbox.y + a.bbox.h, b.bbox.y + b.bbox.h);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return (
    intersection /
    Math.max(1, Math.min(a.bbox.w * a.bbox.h, b.bbox.w * b.bbox.h))
  );
}
function renderReadingFlow(
  blocks: ExtractedLayoutBlock[],
  width: number,
  height: number,
) {
  const lines = collapseLineFragments(blocks);
  const sizes = lines.map((line) => line.font?.size ?? 10);
  const bodySize = median(sizes);
  const left = Math.min(...lines.map((line) => line.bbox.x));
  const top = Math.min(...lines.map((line) => line.bbox.y));
  const right = Math.max(...lines.map((line) => line.bbox.x + line.bbox.w));
  const bottom = Math.max(...lines.map((line) => line.bbox.y + line.bbox.h));
  const groups: ExtractedLayoutBlock[][] = [];
  for (const line of lines) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    const gap = previous
      ? line.bbox.y - (previous.bbox.y + previous.bbox.h)
      : Number.POSITIVE_INFINITY;
    if (
      !current ||
      gap > Math.max(4, bodySize * 0.8) ||
      Math.abs(line.bbox.x - previous!.bbox.x) > width * 0.12
    )
      groups.push([line]);
    else current.push(line);
  }
  const content = groups
    .map((group, index) => {
      const maxSize = Math.max(
        ...group.map((line) => line.font?.size ?? bodySize),
      );
      const heading = maxSize > bodySize * 1.35 && group.length <= 3;
      const tag = heading ? "h2" : "p";
      const color =
        group.find((line) => line.font?.color)?.font?.color ?? "#171717";
      return `<${tag} data-flow-group="${index}" style="font-size:${(((heading ? maxSize : bodySize) / width) * 100).toFixed(3)}cqw;color:${color}">${escapeHtml(group.map((line) => line.text).join(" "))}</${tag}>`;
    })
    .join("");
  return `<article class="reading-flow" style="left:${percent(left, width)}%;top:${percent(top, height)}%;width:${boundedPercent(left, right - left, width)}%;height:${boundedPercent(top, bottom - top, height)}%">${content}</article>`;
}
function collapseLineFragments(blocks: ExtractedLayoutBlock[]) {
  const rows: ExtractedLayoutBlock[][] = [];
  for (const block of [...blocks].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  )) {
    const row = rows.find(
      (candidate) =>
        Math.abs(candidate[0]!.bbox.y - block.bbox.y) <
        Math.max(2, block.bbox.h * 0.35),
    );
    if (row) row.push(block);
    else rows.push([block]);
  }
  return rows.map((row) => {
    const ordered = row.sort((a, b) => a.bbox.x - b.bbox.x);
    const fragments: ExtractedLayoutBlock[] = [];
    for (const block of ordered) {
      const duplicate = fragments.findIndex(
        (candidate) => overlap(candidate, block) > 0.55,
      );
      if (duplicate < 0) fragments.push(block);
      else if (
        (block.text?.length ?? 0) > (fragments[duplicate]?.text?.length ?? 0)
      )
        fragments[duplicate] = block;
    }
    const left = Math.min(...fragments.map((block) => block.bbox.x));
    const top = Math.min(...fragments.map((block) => block.bbox.y));
    const right = Math.max(
      ...fragments.map((block) => block.bbox.x + block.bbox.w),
    );
    const bottom = Math.max(
      ...fragments.map((block) => block.bbox.y + block.bbox.h),
    );
    return {
      ...fragments[0]!,
      text: fragments
        .map((block) => block.text?.trim())
        .filter(Boolean)
        .join(" "),
      bbox: { x: left, y: top, w: right - left, h: bottom - top },
    };
  });
}

/** PDF text layers often split a hyphenated teaching word into several font
 * runs and report slightly different sizes for each run. Treat adjacent
 * word-like fragments on the same baseline as one typographic unit so a word
 * such as “tel-e-vi-sio-n” cannot visibly jump in size mid-word. */
function normalizeAdjacentWordFontSizes(
  blocks: ExtractedLayoutBlock[],
  pageWidth: number,
  pageHeight: number,
) {
  const result = new Map<ExtractedLayoutBlock, number>();
  // A trailing punctuation mark (a period ending a sentence, a comma, an
  // apostrophe in "don't") is often glued onto the last word's own font run
  // by PDF text extraction. Excluding it here left that word out of its own
  // sentence's normalization group entirely, keeping its raw (and often
  // slightly different) per-run size while every neighbouring word snapped
  // to the shared median - producing a visibly different size mid-sentence.
  const wordLike = (block: ExtractedLayoutBlock) => {
    const text = block.text?.trim() ?? "";
    return (
      /^-+$/u.test(text) ||
      /^[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*-?[.,:;!?'"]?$/u.test(text)
    );
  };
  const candidates = blocks.filter(wordLike);
  const visited = new Set<ExtractedLayoutBlock>();
  for (const start of candidates) {
    if (visited.has(start)) continue;
    const group: ExtractedLayoutBlock[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      const currentSize =
        current.font?.size ?? Math.max(6, current.bbox.h * 0.82);
      for (const candidate of candidates) {
        if (visited.has(candidate)) continue;
        const candidateSize =
          candidate.font?.size ?? Math.max(6, candidate.bbox.h * 0.82);
        const baselineDelta = Math.abs(
          current.bbox.y + current.bbox.h -
            (candidate.bbox.y + candidate.bbox.h),
        );
        const horizontalGap = Math.max(
          0,
          Math.max(current.bbox.x, candidate.bbox.x) -
            Math.min(
              current.bbox.x + current.bbox.w,
              candidate.bbox.x + candidate.bbox.w,
            ),
        );
        const similarScale =
          Math.max(currentSize, candidateSize) /
            Math.max(1, Math.min(currentSize, candidateSize)) <=
          1.8;
        // Justified or letter-tracked lines can space words wider than a
        // typical single inter-word gap; the old, tighter tolerances split
        // one visually uniform printed line into two separate groups, each
        // then normalized to its own local median - two different sizes
        // within what the book shows as one run.
        if (
          baselineDelta <= Math.max(2, pageHeight * 0.004) &&
          horizontalGap <= Math.max(currentSize, candidateSize) * 1.8 &&
          horizontalGap <= pageWidth * 0.045 &&
          similarScale
        ) {
          visited.add(candidate);
          queue.push(candidate);
        }
      }
    }
    if (group.length < 2) continue;
    const sharedSize = median(
      group.map(
        (block) => block.font?.size ?? Math.max(6, block.bbox.h * 0.82),
      ),
    );
    for (const block of group) result.set(block, sharedSize);
  }
  return result;
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
}
function percent(value: number, total: number) {
  return Math.max(0, Math.min(100, (value / total) * 100)).toFixed(3);
}
function boundedPercent(start: number, size: number, total: number) {
  return Math.max(
    0,
    Math.min(100 - Math.max(0, (start / total) * 100), (size / total) * 100),
  ).toFixed(3);
}
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

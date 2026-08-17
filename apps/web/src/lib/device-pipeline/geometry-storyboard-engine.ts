import type {
  ExtractedLayoutBlock,
  ExtractedPageAsset,
} from "@/components/device/device-types";
import {
  inferCorrectAnswers,
  renderMathInText,
} from "@/lib/device-pipeline/math-content-engine";

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
};
const nonContentText =
  /for online (?:reading|use) only|\.indd\s+\d|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?/i;
const answerRuleSource = String.raw`(?:\.{3,}|(?:[_\p{Pd}]\s*){3,})`;
const oralInstruction =
  /\borally\b|\b(?:read|practise|practice)\s+(?:the\s+.+\s+)?aloud\b|\b(?:answer|describe|discuss|say)\s+(?:the\s+.+\s+)?orally\b|\bpronounc(?:e|iation)\b|\bsoma\s+kwa\s+sauti\b|\bsema\s+kwa\s+sauti\b/i;
const activityHeadingPattern =
  /^(?:(?:activity|exercise|practice|zoezi|maswali)\b|shughuli(?:\s+(?:ya\s+)?\d+|\s*[:.–—-]|\s*$))/i;

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
  const visibleAssets = deduplicateVisualAssets(
    (page.assets ?? []).filter(
      (asset) =>
        !asset.containsText ||
        asset.id.includes("composite-example") ||
        asset.id.includes("composite-activity-diagram"),
    ),
  );
  const composedExampleBounds = visibleAssets
    .filter(
      (asset) =>
        asset.id.includes("composite-example") ||
        asset.id.includes("composite-activity-diagram"),
    )
    .map((asset) => asset.bounds);
  const blocks = deduplicateTextBlocks(rawTextBlocks);
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
  // Never invent panels from generic PDF image bounds. Real page decoration
  // is retained only when it was extracted as an actual image asset.
  const semanticDecorations = "";
  // Preserve the PDF's measured line geometry. Reflowing dense pages into one
  // article made them readable, but no longer recognisable as the same book.
  const positionedText = contentBlocks
    .map((block, index) => {
      if (fractionComponents.has(block)) return "";
      const size = Math.max(
        5,
        coherentFontSizes.get(block) ??
          block.font?.size ??
          Math.min(block.bbox.h * 0.82, 14),
      );
      const weight = /bold|black|heavy|semibold/i.test(
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
        isLightColor(sourceColor) && size >= 22
          ? readableTextColor(
              safeColor(nearbyCoverTextColor ?? decoration.accent),
              pageSurface,
              3,
            )
          : sitsOnStrongPanel
            ? sourceColor
            : readableTextColor(
                sourceColor,
                pageSurface,
                size >= 15 ? 3 : 4.5,
              );
      const tag = size >= 22 ? "h1" : size >= 15 ? "h2" : "p";
      const sourceFamily = sourceFontFamily(block.font, options.fontFamily);
      const activityHeading =
        activityHeadingPattern.test(block.text?.trim() ?? "");
      const exampleHeading = isNumberedExampleHeading(block);
      const renderedWidth = activityHeading
        ? Math.min(
            width - block.bbox.x - width * 0.055,
            Math.max(block.bbox.w, width * 0.72),
          )
        : exampleHeading
          ? Math.min(width - block.bbox.x, Math.max(block.bbox.w, width * 0.23))
          : block.bbox.w;
      const estimatedTextWidth = Math.max(
        size,
        [...(block.text ?? "")].reduce(
          (total, character) =>
            total +
            size *
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
      const wordFragment =
        /^[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*-?$/u.test(
          block.text?.trim() ?? "",
        ) && (block.text?.trim().length ?? 0) <= 28;
      const numericBlock =
        /\d/.test(block.text ?? "") &&
        /^[\d\s.,:;()\[\]+\-−×x÷=/%]+$/.test(block.text?.trim() ?? "");
      const fittedSize =
        numericBlock
          ? size *
            Math.min(
              1,
              Math.max(0.42, renderedWidth / estimatedTextWidth),
            )
          : activityHeading || exampleHeading
          ? size
          : size;
      const horizontalScale =
        numericBlock || activityHeading || exampleHeading || wordFragment
          ? 1
          : Math.min(
              1,
              Math.max(0.72, renderedWidth / estimatedTextWidth),
            );
      const className = activityHeading
        ? "activity-heading"
        : exampleHeading
          ? "example-heading"
          : undefined;
      const insideComposedExample = composedExampleBounds.some(
        (bounds) =>
          block.bbox.x + block.bbox.w / 2 >= bounds.x &&
          block.bbox.x + block.bbox.w / 2 <= bounds.x + bounds.w &&
          block.bbox.y + block.bbox.h / 2 >= bounds.y &&
          block.bbox.y + block.bbox.h / 2 <= bounds.y + bounds.h,
      );
      const headingSurface = activityHeading
        ? `;padding:.14em .48em;border-radius:.35em;background:linear-gradient(180deg,color-mix(in srgb,${safeColor(decoration.accent)} 18%,#ffe4ca),color-mix(in srgb,${safeColor(decoration.accent)} 28%,#ffd3ad));box-shadow:0 .12em .25em #0002`
        : "";
      const hiddenSemanticStyle = insideComposedExample
        ? "position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;"
        : "";
      return `<${tag} data-layout-block="${index}"${numericBlock ? ' data-numeric-layout="true"' : ""}${insideComposedExample ? ' class="composite-example-semantics"' : className ? ` class="${className}"` : ""} style="${hiddenSemanticStyle}left:${percent(block.bbox.x, width)}%;top:${percent(block.bbox.y, height)}%;width:${boundedPercent(block.bbox.x, renderedWidth, width)}%;min-height:${boundedPercent(block.bbox.y, block.bbox.h, height)}%;font-family:${sourceFamily};font-size:${((fittedSize / width) * 100).toFixed(3)}cqw;font-weight:${weight};font-style:${style};color:${exampleHeading ? "#ffffff" : color}${horizontalScale < 0.999 ? `;transform:scaleX(${horizontalScale.toFixed(4)});transform-origin:left top` : ""}${numericBlock ? ";overflow:hidden;text-overflow:clip" : ""}${headingSurface}">${renderMathInText(block.text!)}</${tag}>`;
    })
    .join("");
  const fractionMath = fractionRows
    .map(
      (row, index) =>
        `<span class="geometry-math" data-fraction-row="${index}" data-latex="${escapeHtml(row.latex)}" style="position:absolute;z-index:3;left:${percent(row.bbox.x, width)}%;top:${percent(row.bbox.y, height)}%;width:${boundedPercent(row.bbox.x, row.bbox.w, width)}%;height:${boundedPercent(row.bbox.y, row.bbox.h, height)}%;display:flex;align-items:center;font-size:${((row.fontSize / width) * 100).toFixed(3)}cqw;line-height:1"><math aria-label="${escapeHtml(row.label)}"><mrow><mfrac><mn>${row.numerators[0]}</mn><mn>${row.denominator}</mn></mfrac><mo>+</mo><mfrac><mn>${row.numerators[1]}</mn><mn>${row.denominator}</mn></mfrac><mo>=</mo></mrow></math></span>`,
    )
    .join("");
  const text = positionedText + fractionMath;
  const examplePanelBounds = buildExamplePanels(rawTextBlocks, width, height);
  const activityPanelBounds = buildActivityPanels(rawTextBlocks, width, height);
  const inferredPanels = [...examplePanelBounds, ...activityPanelBounds];
  const sourceRules = (page.layoutBlocks ?? [])
    .filter((block) => {
      if (block.type !== "image") return false;
      // Cover typography is frequently intersected by tiny vector fragments
      // from crop/registration artwork. They are not content rules and must
      // never be reconstructed behind the title.
      if (page.number === 1) return false;
      const horizontal = block.bbox.h <= Math.max(2.5, height * 0.004);
      const vertical = block.bbox.w <= Math.max(2.5, width * 0.004);
      const centerX = block.bbox.x + block.bbox.w / 2;
      const centerY = block.bbox.y + block.bbox.h / 2;
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
        inferredPanels.some((panel) =>
          ruleDuplicatesPanelEdge(block.bbox, panel, width, height),
        )
      )
        return false;
      return horizontal || vertical;
    })
    .map(
      (block, index) =>
        `<span class="source-rule" data-source-rule="${index}" aria-hidden="true" style="left:${percent(block.bbox.x, width)}%;top:${percent(block.bbox.y, height)}%;width:${boundedPercent(block.bbox.x, Math.max(block.bbox.w, 1), width)}%;height:${boundedPercent(block.bbox.y, Math.max(block.bbox.h, 1), height)}%"></span>`,
    )
    .join("");
  const examplePanels = examplePanelBounds
    .map(
      (panel, index) =>
        `<span class="example-panel" data-example-panel="${index}" aria-hidden="true" style="left:${percent(panel.x, width)}%;top:${percent(panel.y, height)}%;width:${boundedPercent(panel.x, panel.w, width)}%;height:${boundedPercent(panel.y, panel.h, height)}%"></span>`,
    )
    .join("");
  const activityPanels = activityPanelBounds
    .map(
      (panel, index) =>
        `<span class="activity-panel" data-activity-panel="${index}" aria-hidden="true" style="left:${percent(panel.x, width)}%;top:${percent(panel.y, height)}%;width:${boundedPercent(panel.x, panel.w, width)}%;height:${boundedPercent(panel.y, panel.h, height)}%;border:0;background:color-mix(in srgb,${safeColor(decoration.accent)} 5%,#f4f0df)"></span>`,
    )
    .join("");
  const activityGridCells = buildActivityGridCells(
    visibleAssets,
    rawTextBlocks,
    width,
    height,
  )
    .map(
      (cell, index) =>
        `<span class="activity-grid-cell" data-grid-cell="${index}" aria-hidden="true" style="left:${percent(cell.x, width)}%;top:${percent(cell.y, height)}%;width:${boundedPercent(cell.x, cell.w, width)}%;height:${boundedPercent(cell.y, cell.h, height)}%"></span>`,
    )
    .join("");
  const semanticTables = buildSemanticNumericTable(contentBlocks, height);
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
  const graphicalAnswerBlocks = (page.layoutBlocks ?? []).filter((block) => {
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
  const stackedCellTargets = buildStackedArithmeticCellTargets(
    contentBlocks,
    page.layoutBlocks ?? [],
    width,
    height,
  );
  const rawAnswerTargets = [
    ...textualAnswerTargets,
    ...(oralOnly || stackedCellTargets.length >= 4
      ? []
      : graphicalAnswerBlocks.map((block) => ({
          ...block,
          text: undefined,
          confidence: 0.9,
          evidence: "printed-writing-rule",
        }))),
    ...numberedVisualTargets.map((target) => ({
      ...target,
      confidence: 0.72,
      evidence: "semantically-aligned-whitespace",
    })),
    ...labeledItemTargets,
    ...proseQuestionTargets,
    ...fractionDiagramTargets,
    ...equationAnswerTargets,
    ...stackedCellTargets,
  ];
  const answerTargets = validateAnswerTargets(
    rawAnswerTargets,
    contentBlocks,
    visibleAssets,
    width,
    height,
    activityPanelBounds,
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
  const naturalAnswerStyle = `<style data-litera-answer-style>.source-answer-line input{border:0;border-bottom:.13cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 62%,#5f5b52);border-radius:.18cqw .18cqw 0 0;background:color-mix(in srgb,${safeColor(decoration.accent)} 5%,transparent);color:#171717;padding:0 .18cqw;font-weight:500;box-shadow:none}.source-answer-line[data-placement-evidence="numbered-prose-question"] input{border:.12cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 48%,#777);border-radius:.55cqw;background:color-mix(in srgb,${safeColor(decoration.accent)} 4%,#fff)}.source-answer-line input:hover{background:color-mix(in srgb,${safeColor(decoration.accent)} 8%,transparent)}.source-answer-line input:focus{border-bottom:.2cqw solid ${safeColor(decoration.accent)};background:color-mix(in srgb,${safeColor(decoration.accent)} 10%,#fff);box-shadow:0 .14cqw 0 color-mix(in srgb,${safeColor(decoration.accent)} 32%,transparent)}.source-answer-line input[data-answer-state="correct"]{border-bottom-color:#16803c;background:color-mix(in srgb,#16803c 9%,transparent)}.source-answer-line input[data-answer-state="incorrect"]{border-bottom-color:#b42318;background:color-mix(in srgb,#b42318 7%,transparent)}</style>`;
  const answerLines = naturalAnswerStyle + inlineAnswerTargets
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
      const geometricAnswer =
        "correctAnswer" in block && typeof block.correctAnswer === "string"
          ? block.correctAnswer
          : undefined;
      const correctAnswer =
        geometricAnswer ??
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
  const answerSubmit = answerTargets.length && !useDenseQuestionFlow
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
  const folio = renderSourceFolio(page, width, height, options);
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
  ].filter(Boolean).join(" ");
  const pageClass = pageClasses ? ` class="${pageClasses}"` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;min-height:100%;background:#e9eaec}body{display:flex;justify-content:center;align-items:flex-start;overflow-x:hidden}main[data-litera-page]{container-type:inline-size;width:100%;max-width:none;aspect-ratio:${width}/${height};position:relative;overflow:hidden;background:${background};background-color:${pageSurface};color:#171717;font-family:${font}}main.dense-activity-page{overflow-y:auto}.dense-question-flow{position:absolute;z-index:10;left:8%;width:84%;box-sizing:border-box;padding:2.2cqw 2.8cqw 4cqw;display:flex;flex-direction:column;gap:2.2cqw;box-shadow:0 -1cqw 1.5cqw ${pageSurface}}.dense-question{display:flex;flex-direction:column;gap:.8cqw}.dense-question p{margin:0;font:500 1.7cqw/1.45 ${font}}.dense-question label{display:block;position:relative}.dense-question input{box-sizing:border-box;width:72%;min-height:4.8cqw;padding:.7cqw 1cqw;border:.12cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 48%,#777);border-radius:.65cqw;background:#fff;color:#171717;font:600 1.55cqw/1.2 ${font};outline:none}.dense-question input:focus{border-color:${safeColor(decoration.accent)};box-shadow:0 0 0 .25cqw color-mix(in srgb,${safeColor(decoration.accent)} 25%,transparent)}.dense-question-flow .litera-submit-answers{position:static;align-self:flex-end;margin-top:1cqw}[data-layout-block],figure,.semantic-decoration,.source-answer-line,.source-rule,.activity-grid-cell,.example-panel,.activity-panel{position:absolute;margin:0;box-sizing:border-box}[data-layout-block]{z-index:2;overflow:visible;white-space:nowrap;overflow-wrap:normal;line-height:1;${sourceMode ? "color:transparent!important;text-shadow:none!important" : ""}}.activity-heading{z-index:3!important;border-radius:.35em;background:color-mix(in srgb,${safeColor(decoration.accent)} 22%,#fff)}.activity-panel{z-index:0;border:.1cqw solid color-mix(in srgb,${safeColor(decoration.accent)} 48%,#fff);background:color-mix(in srgb,${safeColor(decoration.accent)} 7%,#fff)}.example-panel,.activity-grid-cell{z-index:0}.source-rule{z-index:1;display:block;min-width:1px;min-height:1px;background:${safeColor(decoration.accent)}}.litera-math{display:inline-block}.litera-math math{font-size:1.08em}.semantic-decoration{z-index:0;border:0}.semantic-decoration--strong,.semantic-decoration--wash{background:transparent}figure{z-index:1;overflow:visible}.reading-flow{position:absolute;z-index:2;overflow:hidden;line-height:1.45;overflow-wrap:anywhere}figure img{display:block;width:100%;height:100%;object-fit:contain}.source-answer-line{z-index:5}.source-answer-line input{box-sizing:border-box;width:100%;height:100%;border:0;border-bottom:.16cqw solid #555;background:rgba(255,255,255,.94);color:#171717;font:600 1.45cqw/1.2 ${font};text-align:center;outline:none}.source-answer-line input:focus{border-bottom-color:${safeColor(decoration.accent)};background:#fff}.source-answer-line input[data-answer-state="correct"]{border-bottom-color:#16803c;background:#effcf3}.source-answer-line input[data-answer-state="incorrect"]{border-bottom-color:#b42318;background:#fff3f1}.answer-feedback{position:absolute;top:100%;left:0;min-width:max-content;font:700 1.05cqw/1.3 ${font}}.litera-submit-answers{position:absolute;z-index:12;right:4%;bottom:2.4%;min-width:18%;padding:.75cqw 1.5cqw;border:0;border-radius:999px;background:${safeColor(decoration.accent)};color:#fff;font:700 1.35cqw/1 ${font}}.source-folio{position:absolute;z-index:8;display:flex;align-items:center;box-sizing:border-box;white-space:nowrap}.digital-toc{position:absolute;z-index:3;display:flex;min-height:0;flex-direction:column}.digital-toc h1{margin:0;line-height:1.1}.digital-toc ol{min-height:0;margin:0;padding:0;display:flex;flex-direction:column;list-style:none}.digital-toc li{display:grid;grid-template-columns:auto 1fr auto;align-items:end;min-width:0}.digital-toc .dots{min-width:1rem;border-bottom:.16cqw dotted currentColor;transform:translateY(-.35cqw);opacity:.65}.digital-toc a{display:contents;color:inherit;text-decoration:none}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style></head><body><main${pageClass} data-litera-page aria-label="Accessible book page ${options.digitalPageNumber ?? page.number}">${toc || `${sourcePage}${sourceMode ? "" : semanticDecorations}${sourceRules}${examplePanels}${activityPanels}${activityGridCells}${text}${sourceMode ? "" : images}${answerLines}${denseQuestionFlow}${answerSubmit}${semanticTables}`}${sourceMode ? "" : prepressCleanup}${sourceMode ? "" : folio}</main><script>(function(){var submit=document.querySelector('[data-litera-submit]');var inputs=Array.from(document.querySelectorAll('.source-answer-line input,.dense-question input'));var clean=function(value){return value.normalize('NFKC').toLocaleLowerCase().replace(/[ ,]/g,'').trim()};var update=function(){if(submit)submit.disabled=!inputs.some(function(input){return input.value.trim()})};document.addEventListener('input',function(event){var input=event.target;if(!(input instanceof HTMLInputElement))return;delete input.dataset.answerState;input.removeAttribute('aria-invalid');var feedback=document.getElementById(input.getAttribute('aria-describedby')||'');if(feedback)feedback.textContent='';update()});if(submit)submit.addEventListener('click',function(){var correctCount=0,incorrectCount=0;inputs.forEach(function(input){if(!input.value.trim()||!input.dataset.correctAnswer)return;var correct=clean(input.value)===clean(input.dataset.correctAnswer);input.dataset.answerState=correct?'correct':'incorrect';if(correct)correctCount++;else incorrectCount++;var feedback=document.getElementById(input.getAttribute('aria-describedby')||'');if(feedback)feedback.textContent=correct?'Correct - well done!':'Not correct yet - try again.'});parent.postMessage({type:'litera-answer-feedback',correct:correctCount,incorrect:incorrectCount,checked:correctCount+incorrectCount},'*')});update()})()</script></body></html>`;
}

function localizedSubmitLabel(text: string) {
  if (/\b(?:andika|jibu|swali|sehemu|kivuli|zoezi|shughuli)\b/i.test(text))
    return "Wasilisha majibu";
  if (/\b(?:réponse|question|exercice)\b/i.test(text)) return "Soumettre les réponses";
  if (/\b(?:respuesta|pregunta|ejercicio)\b/i.test(text)) return "Enviar respuestas";
  if (/\b(?:antwort|frage|übung)\b/i.test(text)) return "Antworten senden";
  if (/\b(?:resposta|pergunta|exercício)\b/i.test(text)) return "Enviar respostas";
  return "Submit answers";
}

function buildSemanticNumericTable(
  blocks: ExtractedLayoutBlock[],
  pageHeight: number,
) {
  const numeric = blocks
    .filter((block) => /^\d{2,7}$/.test(block.text?.trim() ?? ""))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  if (numeric.length < 24) return "";
  const rows: ExtractedLayoutBlock[][] = [];
  for (const block of numeric) {
    const row = rows.find(
      (candidate) =>
        Math.abs(candidate[0]!.bbox.y - block.bbox.y) <= pageHeight * 0.009,
    );
    if (row) row.push(block);
    else rows.push([block]);
  }
  const regularRows = rows
    .map((row) => row.sort((a, b) => a.bbox.x - b.bbox.x))
    .filter((row) => row.length >= 4);
  if (regularRows.length < 3) return "";
  const commonColumns = Math.max(...regularRows.map((row) => row.length));
  const tableRows = regularRows.filter(
    (row) => Math.abs(row.length - commonColumns) <= 1,
  );
  if (tableRows.length < 3) return "";
  return `<table class="sr-only source-data-table"><caption>Number table from the printed page</caption><tbody>${tableRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell.text!.trim())}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
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
    const left = Math.max(
      pageWidth * 0.06,
      Math.min(...section.map((block) => block.bbox.x)) - pageWidth * 0.012,
    );
    const measuredRight = Math.min(
      pageWidth * 0.94,
      Math.max(...section.map((block) => block.bbox.x + block.bbox.w)) +
        pageWidth * 0.012,
    );
    const usesRightColumn = section.some(
      (block) => block.bbox.x + block.bbox.w / 2 > pageWidth * 0.58,
    );
    const right = usesRightColumn
      ? Math.max(measuredRight, pageWidth * 0.88)
      : measuredRight;
    const bottom = Math.min(
      pageHeight * 0.94,
      Math.max(...section.map((block) => block.bbox.y + block.bbox.h)) +
        pageHeight * 0.018,
    );
    return {
      x: left,
      y: heading.bbox.y,
      w: right - left,
      h: Math.max(1, bottom - heading.bbox.y),
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
  pageWidth: number,
  pageHeight: number,
) {
  const ordered = [...blocks].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  );
  const headings = ordered.filter(isNumberedExampleHeading);
  return headings.map((heading) => {
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
    const left = Math.max(
      pageWidth * 0.06,
      Math.min(...section.map((block) => block.bbox.x)) - pageWidth * 0.012,
    );
    const right = Math.min(
      pageWidth * 0.94,
      Math.max(...section.map((block) => block.bbox.x + block.bbox.w)) +
        pageWidth * 0.012,
    );
    const top = heading.bbox.y + heading.bbox.h * 0.45;
    const contentBottom = Math.max(
      ...section.map((block) => block.bbox.y + block.bbox.h),
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

function sourceFontFamily(
  source: ExtractedLayoutBlock["font"],
  configured?: string,
) {
  const raw = `${source?.family ?? ""} ${source?.name ?? ""}`.trim();
  if (/andika|comic|hand|school|chalk/i.test(raw))
    return "'Comic Sans MS','Andika',cursive";
  if (/sans|arial|helvetica|gill|futura|avenir/i.test(raw))
    return "Arial,'Helvetica Neue',sans-serif";
  if (/serif|times|garamond|baskerville|georgia/i.test(raw))
    return "Georgia,'Times New Roman',serif";
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
  const rowGap = Math.max(.35, Math.min(rowSize * .7, ((bottom - top) / pageHeight * 100 - titleSize * 2.2) / Math.max(1, entries.length) - rowSize * 1.25));
  return `<nav class="digital-toc" style="${navStyle};color:${rowColor}" aria-labelledby="digital-toc-title"><h1 id="digital-toc-title" style="text-align:${align};font-size:${titleSize.toFixed(2)}cqw;color:${titleColor};font-weight:${heading?.font?.weight ?? 700};margin-bottom:${Math.max(1.4,rowSize * 1.5).toFixed(2)}cqw">${escapeHtml(title)}</h1><ol style="gap:${rowGap.toFixed(2)}cqw">${entries.map((entry) => `<li data-level="${entry.level}" style="gap:${Math.max(.45,rowSize*.35).toFixed(2)}cqw;font-size:${rowSize.toFixed(2)}cqw;padding-inline-start:${Math.max(0, entry.level - 1) * 1.7}cqw"><a href="#page-${entry.pageNumber}" onclick="parent.postMessage({type:'litera-open-page',pageNumber:${entry.pageNumber}},'*');return false"><span>${escapeHtml(entry.title.replace(/\s*\.{2,}\s*\d{1,4}\s*$/, ""))}</span><span class="dots" style="${usesLeaders ? "" : "border-color:transparent"}" aria-hidden="true"></span><span aria-label="Digital page ${entry.pageNumber}">${entry.pageNumber}</span></a></li>`).join("")}</ol></nav>`;
}

function renderSourceFolio(
  page: GeometryPage,
  pageWidth: number,
  pageHeight: number,
  options: GeometryRenderOptions,
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
  return `<span class="source-folio" aria-label="Digital page ${digital}" style="left:${percent(source.bbox.x,pageWidth)}%;top:${percent(source.bbox.y,pageHeight)}%;width:${boundedPercent(source.bbox.x,Math.max(source.bbox.w,pageWidth*.045),pageWidth)}%;height:${boundedPercent(source.bbox.y,source.bbox.h,pageHeight)}%;justify-content:${justify};font-size:${size.toFixed(2)}cqw;color:${color}">${label}</span>`;
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
      return intersection / Math.max(1, smallerArea) > 0.45;
    });
    if (!duplicate) kept.push(asset);
  }
  return kept.sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );
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
    const inkCollision =
      target.evidence !== "numbered-prose-question" &&
      textBlocks.some(
        (block) =>
          block.text?.trim() !== "=" &&
          intersectionRatio(bbox, block.bbox) > 0.12,
      );
    if (inkCollision) continue;
    // A printed-writing-rule target is derived from the source rule itself.
    // Native PDF extraction may also expose that same rule as a tiny image
    // asset, which must not veto the control. Other inferred targets still
    // abstain when they collide with meaningful artwork.
    const pictureCollision =
      target.evidence !== "printed-writing-rule" &&
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
        return boundedFigure && intersectionRatio(bbox, asset.bounds) > 0.035;
      });
    if (pictureCollision) continue;
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
  for (const block of [...blocks].sort(
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
        Math.abs(candidate.bbox.x - block.bbox.x) <
          Math.max(candidate.bbox.w, block.bbox.w) * 0.55 &&
        Math.abs(candidate.bbox.y - block.bbox.y) <
          Math.max(candidate.bbox.h, block.bbox.h) * 1.5;
      return (
        longLineDuplicate ||
        nearbyDuplicate ||
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
  const wordLike = (block: ExtractedLayoutBlock) =>
    /^(?:[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*-?|-+)$/u.test(
      block.text?.trim() ?? "",
    );
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
        if (
          baselineDelta <= Math.max(2, pageHeight * 0.004) &&
          horizontalGap <= Math.max(currentSize, candidateSize) * 1.35 &&
          horizontalGap <= pageWidth * 0.035 &&
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

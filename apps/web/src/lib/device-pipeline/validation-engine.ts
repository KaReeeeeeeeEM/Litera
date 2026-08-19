import type { DeviceBook, StructuredActivity, ValidationIssue, ValidationReport } from "@/components/device/device-types";

export function validateBook(book: DeviceBook): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (issue: Omit<ValidationIssue, "id">) => issues.push({ id: crypto.randomUUID(), ...issue });
  if (!book.storyboardPages?.length) add({ severity: "error", category: "structure", message: "The publication has no rendered storyboard pages." });
  const activitiesByPage = new Map<number, StructuredActivity[]>(
    (book.structuredPages ?? []).map((page) => [page.pageNumber, page.activities ?? []]),
  );
  for (const page of book.storyboardPages ?? []) {
    const document = new DOMParser().parseFromString(page.html, "text/html");
    if (!document.querySelector("main, [role='main']")) add({ severity: "error", category: "accessibility", message: "Page has no main content landmark.", pageNumber: page.pageNumber });
    for (const image of document.querySelectorAll("img")) if (!image.hasAttribute("alt")) add({ severity: "error", category: "accessibility", message: "Image is missing alternative text.", pageNumber: page.pageNumber });
    const ids = [...document.querySelectorAll<HTMLElement>("[data-id]")].map(element => element.dataset.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) add({ severity: "error", category: "structure", message: "Page contains duplicate stable content IDs.", pageNumber: page.pageNumber });
    if (document.querySelector("iframe,object,embed")) add({ severity: "error", category: "package", message: "Page contains unsafe executable or embedded content.", pageNumber: page.pageNumber });
    for (const runtime of document.querySelectorAll<HTMLScriptElement>("script")) {
      const source = runtime.textContent ?? "";
      const recognisedLiteraRuntime = [
        "data-litera-answer-feedback",
        "data-litera-trace-runtime",
        "data-litera-matching-runtime",
        "data-litera-activity-launcher-runtime",
        "data-litera-visual-reading-order",
      ].some((attribute) => runtime.hasAttribute(attribute));
      const answerFeedbackRuntime =
        source.includes("dataset.correctAnswer") &&
        source.includes("litera-answer-feedback");
      const tracingRuntime =
        runtime.hasAttribute("data-litera-trace-runtime") &&
        source.includes("[data-litera-trace-canvas]") &&
        source.includes("litera-answer-feedback");
      if (
        runtime.src ||
        (!recognisedLiteraRuntime && !answerFeedbackRuntime && !tracingRuntime)
      )
        add({ severity: "error", category: "package", message: "Page contains an unrecognised answer-feedback runtime.", pageNumber: page.pageNumber });
    }

    // Every detected activity that expects a response must have rendered an
    // actual control, and radio-choice groups must carry an answer key —
    // otherwise the activity is either invisible or ungradeable to the pupil.
    const activities = activitiesByPage.get(page.pageNumber) ?? [];
    // "Identify the group with many/few objects" activities are detected
    // twice, independently: once here as a StructuredActivity (tagged
    // data-activity-item), and once by the geometry-storyboard renderer as
    // its own dedicated .illustration-choice radio grid (tagged
    // data-question-response, with no knowledge of the StructuredActivity's
    // id). Only the second one ever actually renders for this shape, so a
    // multiple-choice activity is satisfied by either.
    const hasGradedIllustrationChoice = Boolean(
      document.querySelector(".illustration-choice input[data-correct-answer]"),
    );
    for (const activity of activities) {
      if (activity.responseMode === "none" || activity.responseMode === "discussion") continue;
      const control = document.querySelector(
        `[data-activity-item="${activity.id}"], [data-activity-item^="${activity.id}-"]`,
      );
      if (!control) {
        if (activity.type === "multiple-choice" && hasGradedIllustrationChoice) continue;
        add({ severity: "error", category: "accessibility", message: `Activity "${activity.prompt.slice(0, 60)}" (${activity.type}) has no rendered input control.`, pageNumber: page.pageNumber });
        continue;
      }
      if (activity.type === "matching") {
        // A resolved image-to-number matching activity replaces the single
        // .litera-matching-game fallback with one .litera-response-group
        // per picture (see finalizeMatchingActivities), each tagged
        // data-activity-item="<id>[-N]" - a different but equally valid
        // per-item structure from the text-pairs .litera-matching-grid path.
        const perItemGroups = document.querySelectorAll(
          `[data-activity-item^="${activity.id}"].litera-response-group`,
        );
        const hasPerItemGrid = Boolean(control.querySelector(".litera-matching-grid"));
        const matchingGame = control.matches(".litera-matching-game")
          ? control
          : control.querySelector(".litera-matching-game") ??
            document.querySelector(".litera-matching-game");
        const hasAccessibleMatchingGame = Boolean(
          matchingGame &&
          (matchingGame.querySelectorAll(".litera-match-card").length >= 2 ||
            matchingGame.querySelector("[data-litera-drawing-canvas]")),
        );
        if (!hasPerItemGrid && !hasAccessibleMatchingGame && perItemGroups.length < 2) {
          add({ severity: "error", category: "accessibility", message: `Matching activity "${activity.prompt.slice(0, 60)}" fell back to a single free-text field instead of a per-item matching control.`, pageNumber: page.pageNumber });
        }
      }
    }

    const radioNames = new Set(
      [...document.querySelectorAll<HTMLInputElement>("input[type='radio']")].map((input) => input.name).filter(Boolean),
    );
    for (const name of radioNames) {
      const options = [...document.querySelectorAll<HTMLInputElement>(`input[type='radio'][name='${name}']`)];
      if (options.length > 1 && !options.some((option) => option.hasAttribute("data-correct-answer")))
        add({ severity: "error", category: "structure", message: `Choice group "${name}" has no correct-answer key on any option, so it can never be marked right or wrong.`, pageNumber: page.pageNumber });
    }

    const replacementStyle = [...document.querySelectorAll("style[data-litera-answer-visual-replacement]")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    const hiddenAssetIds = replacementStyle.includes("main.litera-activity-playing")
      ? []
      : [...replacementStyle.matchAll(/figure\[data-asset-id="([^"]+)"\]\{visibility:hidden\}/g)].map((match) => match[1]);
    if (hiddenAssetIds.length > 1)
      add({ severity: "warning", category: "accessibility", message: `${hiddenAssetIds.length} content image(s) were hidden and replaced by answer inputs on this page — verify each image was genuinely its own answer slot, not part of one countable group whose answer belongs elsewhere.`, pageNumber: page.pageNumber });
  }
  for (const language of book.conversionConfig?.outputLanguages ?? []) {
    const catalog = book.languageCatalogs?.[language];
    if (!catalog || catalog.entries.length !== (book.sourceTextCatalog?.length ?? 0)) add({ severity: "error", category: "language", message: `${language} does not contain a complete translated text catalog.` });
    const expectedSpeech = catalog?.entries.filter(entry => entry.text.trim()).length ?? 0;
    const actualSpeech = book.speechEntries?.filter(entry => entry.language === language).length ?? 0;
    if (expectedSpeech && actualSpeech < expectedSpeech) add({ severity: "warning", category: "media", message: `${language} narration covers ${actualSpeech} of ${expectedSpeech} entries.` });
  }
  for (const video of book.signVideos ?? []) if (!video.target?.trim()) add({ severity: "warning", category: "media", message: `Signed video “${video.name}” is not mapped to content.` });
  return { generatedAt: new Date().toISOString(), issues, passed: !issues.some(issue => issue.severity === "error") };
}

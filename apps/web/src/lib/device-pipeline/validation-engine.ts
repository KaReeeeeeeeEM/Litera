import type { DeviceBook, ValidationIssue, ValidationReport } from "@/components/device/device-types";

export function validateBook(book: DeviceBook): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (issue: Omit<ValidationIssue, "id">) => issues.push({ id: crypto.randomUUID(), ...issue });
  if (!book.storyboardPages?.length) add({ severity: "error", category: "structure", message: "The publication has no rendered storyboard pages." });
  for (const page of book.storyboardPages ?? []) {
    const document = new DOMParser().parseFromString(page.html, "text/html");
    if (!document.querySelector("main, [role='main']")) add({ severity: "error", category: "accessibility", message: "Page has no main content landmark.", pageNumber: page.pageNumber });
    for (const image of document.querySelectorAll("img")) if (!image.hasAttribute("alt")) add({ severity: "error", category: "accessibility", message: "Image is missing alternative text.", pageNumber: page.pageNumber });
    const ids = [...document.querySelectorAll<HTMLElement>("[data-id]")].map(element => element.dataset.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) add({ severity: "error", category: "structure", message: "Page contains duplicate stable content IDs.", pageNumber: page.pageNumber });
    if (document.querySelector("iframe,object,embed")) add({ severity: "error", category: "package", message: "Page contains unsafe executable or embedded content.", pageNumber: page.pageNumber });
    for (const runtime of document.querySelectorAll<HTMLScriptElement>("script")) {
      if (runtime.src || !runtime.textContent?.includes("dataset.correctAnswer")) add({ severity: "error", category: "package", message: "Page contains an unrecognised answer-feedback runtime.", pageNumber: page.pageNumber });
    }
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

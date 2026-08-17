import type { StructuredPage } from "@/components/device/device-types";

/** A fresh storyboard run renders each source page once, even if persisted
 * structure state accidentally contains repeated entries for the same page. */
export function uniqueStoryboardSources(pages: StructuredPage[] | undefined) {
  const seen = new Set<number>();
  return (pages ?? []).filter(page => {
    if (page.status !== "ready" || seen.has(page.pageNumber)) return false;
    seen.add(page.pageNumber);
    return true;
  });
}

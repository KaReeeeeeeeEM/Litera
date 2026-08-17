import type { ConversionConfig } from "@/components/device/device-types";

export function selectedSourcePages(totalPages: number, config?: ConversionConfig) {
  const all = Array.from({ length: totalPages }, (_, index) => index + 1);
  if (!config || config.scope === "whole") return all;
  if (config.scope === "range") {
    const from = clampPage(config.pageFrom, totalPages, 1);
    const to = clampPage(config.pageTo, totalPages, totalPages);
    return from > to ? [] : all.filter((page) => page >= from && page <= to);
  }
  const selected = new Set<number>();
  for (const token of (config.pageParts ?? "").split(",")) {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) continue;
    const from = clampPage(match[1], totalPages, 1);
    const to = clampPage(match[2] ?? match[1], totalPages, from);
    for (let page = Math.min(from, to); page <= Math.max(from, to); page += 1)
      selected.add(page);
  }
  return [...selected].sort((a, b) => a - b);
}

function clampPage(value: string, totalPages: number, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(totalPages, parsed));
}

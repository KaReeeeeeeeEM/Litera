import type { SpeechEntry } from "@/components/device/device-types";

export function spokenWordAtTime(
  entry: SpeechEntry,
  currentSeconds: number,
  audioDurationSeconds: number,
) {
  if (!entry.words.length) return -1;
  const timelineEnd = entry.words.at(-1)?.endMs || entry.durationMs || 1;
  const elapsedMs = audioDurationSeconds > 0
    ? (currentSeconds / audioDurationSeconds) * timelineEnd
    : currentSeconds * 1000;
  const index = entry.words.findIndex((word) => elapsedMs >= word.startMs && elapsedMs < word.endMs);
  return index >= 0 ? index : Math.min(entry.words.length - 1, Math.max(0, entry.words.findLastIndex((word) => elapsedMs >= word.startMs)));
}

export function alignSpeechToRenderedWords(spoken: string[], rendered: string[]) {
  const output: number[] = [];
  let renderedCursor = 0;
  for (const word of spoken) {
    const spokenToken = normalizeToken(word);
    let match = -1;
    if (!spokenToken) {
      output.push(-1);
      continue;
    }
    for (let index = renderedCursor; index < Math.min(rendered.length, renderedCursor + 12); index += 1) {
      if (normalizeToken(rendered[index] ?? "") === spokenToken) {
        match = index;
        break;
      }
    }
    // Never force an unmatched spoken token onto the next visible word. A
    // missing highlight is safer than a confident but misleading highlight.
    output.push(match);
    if (match >= 0) renderedCursor = match + 1;
  }
  return output;
}

export function readerTargetIds(textId: string, assetId?: string) {
  return [...new Set([textId, assetId].filter((value): value is string => Boolean(value)))];
}

function normalizeToken(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replaceAll("©", "copyright")
    .replaceAll("®", "registered")
    .replaceAll("™", "trademark")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

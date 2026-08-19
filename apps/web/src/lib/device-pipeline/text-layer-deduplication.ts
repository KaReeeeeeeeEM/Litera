/** Collapse a complete repeated phrase created by duplicate PDF paint layers. */
export function collapseRepeatedDisplayText(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const tokens = trimmed.split(" ");
  if (tokens.length < 2 || tokens.length > 24) return trimmed;
  const normalized = tokens.map((token) =>
    token.normalize("NFKC").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase(),
  );
  for (let size = 1; size <= Math.floor(tokens.length / 2); size += 1) {
    if (tokens.length % size !== 0) continue;
    const phrase = normalized.slice(0, size);
    if (normalized.every((token, index) => token && token === phrase[index % size]))
      return tokens.slice(0, size).join(" ").replace(/[,:;]+$/, "");
  }
  return trimmed;
}

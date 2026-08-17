/** Parse JSON returned by a model without evaluating provider-controlled code. */
export function parseProviderJson<T>(raw: string): T {
  const unfenced = raw
    .replace(/^\uFEFF/, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const candidates = [unfenced, balancedJson(unfenced)].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );
  let lastError: unknown;
  for (const candidate of candidates) {
    for (const normalized of [candidate, repairCommonJson(candidate)]) {
      try {
        return JSON.parse(normalized) as T;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw new Error(
    `The AI provider returned incomplete or invalid JSON${lastError instanceof Error ? `: ${lastError.message}` : "."}`,
  );
}

export async function readProviderResponseJson<T>(
  response: Response,
  provider: string,
): Promise<T> {
  const body = await response.text();
  try {
    return parseProviderJson<T>(body);
  } catch {
    const contentType = response.headers.get("content-type") ?? "unknown content";
    const detail = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(
      `${provider} returned an unreadable ${response.status || "network"} response (${contentType})${detail ? `: ${detail}` : ". Please try again."}`,
    );
  }
}

function balancedJson(value: string) {
  const start = value.search(/[\[{]/);
  if (start < 0) return "";
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.at(-1) !== expected) continue;
      stack.pop();
      if (!stack.length) return value.slice(start, index + 1);
    }
  }
  return "";
}

function repairCommonJson(value: string) {
  return value
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
}

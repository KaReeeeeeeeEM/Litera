import katex from "katex";

const swahiliPlaces: Record<string, number> = {
  mamoja: 1,
  makumi: 10,
  mamia: 100,
  maelfu: 1_000,
  "makumi elfu": 10_000,
  "mamia elfu": 100_000,
  mamilioni: 1_000_000,
};

export function inferCorrectAnswers(prompt: string) {
  const normalized = prompt.replaceAll(",", "").replace(/\s+/g, " ").trim();
  if (isNumericIdentifier(normalized)) return [];
  const placeAnswer = inferSwahiliPlaceNumber(normalized);
  if (placeAnswer !== undefined) return [String(placeAnswer)];
  const placeQueryAnswer = inferPlaceValueQuery(normalized);
  if (placeQueryAnswer !== undefined) return [String(placeQueryAnswer)];
  const fractionAnswer = inferSwahiliFractionWordProblem(
    normalized.replace(/^\d{1,2}[.)]\s*/, ""),
  );
  if (fractionAnswer) return [fractionAnswer];

  const expression = [
    ...normalized.matchAll(
      /(\d+(?:\.\d+)?(?:\s*[+×x÷*/−-]\s*\d+(?:\.\d+)?)+)/gi,
    ),
  ].at(-1)?.[1];
  const result = expression ? evaluateArithmetic(expression) : undefined;
  if (result !== undefined) return [formatNumber(result)];

  const numbers = [...normalized.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) =>
    Number(match[0]),
  );
  if (
    numbers.length >= 2 &&
    (/\b(?:jumla|kwa pamoja|sum|total)\b/i.test(normalized) ||
      /\b(?:alipata|alitumia|kilitumia|alilipa)\b.*\b(?:kiasi gani|shilingi ngapi)\b/i.test(
        normalized,
      ) ||
      /\bfaida\b.*\b(?:aliuza|kuuza|bei ya kuuza)\b/i.test(normalized) ||
      /\bhasara\b.*\b(?:imenunuliwa|bei ya kununua)\b/i.test(normalized))
  )
    return [formatNumber(numbers.reduce((total, value) => total + value, 0))];
  if (
    numbers.length >= 2 &&
    /\b(?:tofauti|difference|imebaki|remaining)\b/i.test(normalized)
  )
    return [
      formatNumber(
        numbers[0]! -
          numbers.slice(1).reduce((total, value) => total + value, 0),
      ),
    ];
  return [];
}

const swahiliQuantities: Record<string, number> = {
  moja: 1,
  mmoja: 1,
  kimoja: 1,
  mbili: 2,
  wawili: 2,
  mawili: 2,
  vitatu: 3,
  tatu: 3,
  watatu: 3,
  nne: 4,
  wanne: 4,
  sita: 6,
  nane: 8,
  manane: 8,
  ishirini: 20,
};

function inferSwahiliFractionWordProblem(value: string) {
  if (!/\b(?:sehemu gani|kila (?:mmoja|mtoto)|kwa usawa)\b/i.test(value))
    return undefined;
  const quantity = (token: string | undefined) =>
    token ? (swahiliQuantities[token.toLocaleLowerCase()] ?? Number(token)) : NaN;
  const token = "(\\d+|moja|mmoja|kimoja|mbili|wawili|mawili|tatu|watatu|vitatu|nne|wanne|sita|nane|manane|ishirini)";

  const equalRecipients = value.match(
    new RegExp(`\\b(?:watoto|watu|wanafunzi)(?:\\s+(?:wake|hao))?\\s+${token}\\b[^?]{0,90}\\bkwa usawa`, "i"),
  );
  const recipientCount = quantity(equalRecipients?.[1]);
  if (Number.isFinite(recipientCount) && recipientCount > 1)
    return simplifiedFraction(1, recipientCount);

  const friends = value.match(new RegExp(`\\brafiki(?:\\s+zake)?\\s+${token}\\b`, "i"));
  const friendCount = quantity(friends?.[1]);
  if (/\bkila moja\b/i.test(value) && Number.isFinite(friendCount))
    return simplifiedFraction(1, friendCount + 1);

  const partition = value.match(
    new RegExp(`\\bsehemu\\s+${token}\\b[^?]{0,130}\\b(?:kipande|sehemu)\\s+${token}\\b`, "i"),
  );
  const parts = quantity(partition?.[1]);
  const selected = quantity(partition?.[2]);
  if (Number.isFinite(parts) && Number.isFinite(selected) && parts > 0)
    return simplifiedFraction(selected, parts);

  const comparison = value.match(
    new RegExp(`\\b${token}\\s+ni sehemu gani ya[^?]{0,90}?\\b${token}\\b`, "i"),
  );
  const numerator = quantity(comparison?.[1]);
  const denominator = quantity(comparison?.[2]);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0)
    return simplifiedFraction(numerator, denominator);

  const allQuantities = [...value.matchAll(new RegExp(`\\b${token}\\b`, "gi"))]
    .map((match) => quantity(match[1]))
    .filter(Number.isFinite);
  if (allQuantities.length >= 2) {
    const denominatorCandidate = Math.max(...allQuantities);
    const numeratorCandidate = Math.min(...allQuantities);
    if (denominatorCandidate > numeratorCandidate)
      return simplifiedFraction(numeratorCandidate, denominatorCandidate);
  }
  return undefined;
}

function simplifiedFraction(numerator: number, denominator: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
  const divisor = gcd(numerator, denominator) || 1;
  return `${numerator / divisor}/${denominator / divisor}`;
}

export function renderMathInText(value: string) {
  if (isNumericIdentifier(value)) return escapeHtml(value);
  // Render both full calculations and standalone fractions in prose. The old
  // expression-only matcher left values such as "sehemu 2/6" as a cramped
  // slash, even though the same fraction in an equation used stacked MathML.
  const token = /\d+(?:[,.]\d+)?(?:\s*[+×x÷*/−-]\s*\d+(?:[,.]\d+)?)+(?:\s*=\s*(?:\?|_+)?)?|\b\d+\s*\/\s*\d+\b/g;
  let cursor = 0;
  let rendered = "";
  let found = false;
  for (const match of value.matchAll(token)) {
    const source = match[0];
    const index = match.index ?? 0;
    // Dates and multi-part path-like identifiers are prose, not fractions.
    const before = value[index - 1] ?? "";
    const after = value[index + source.length] ?? "";
    if ((before === "/" || after === "/") && !/[+×x÷*=]/.test(source))
      continue;
    const latex = arithmeticToLatex(source);
    const mathml = katex.renderToString(latex, {
      output: "mathml",
      throwOnError: false,
      strict: false,
    });
    rendered += escapeHtml(value.slice(cursor, index));
    rendered += `<span class="litera-math" data-latex="${escapeAttribute(latex)}">${mathml}</span>`;
    cursor = index + source.length;
    found = true;
  }
  return found ? rendered + escapeHtml(value.slice(cursor)) : escapeHtml(value);
}

function isNumericIdentifier(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (/\b(?:isbn|issn|simu|tel(?:ephone)?|phone|fax|tarehe|date)\s*:/i.test(normalized))
    return true;
  // Hyphenated identifiers have at least four numeric groups and no explicit
  // equation/result marker. They are not subtraction exercises.
  return (
    !/[=?]/.test(normalized) &&
    (normalized.match(/\d+/g)?.length ?? 0) >= 4 &&
    (normalized.match(/[-−]/g)?.length ?? 0) >= 3
  );
}

export function evaluateArithmetic(value: string) {
  const tokens = value
    .replaceAll(",", "")
    .replace(/[x×]/gi, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .match(/\d+(?:\.\d+)?|[+*/-]/g);
  if (!tokens?.length || !tokens.some((token) => /^[+*/-]$/.test(token)))
    return undefined;
  const values: number[] = [Number(tokens[0])];
  const operators: string[] = [];
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const number = Number(tokens[index + 1]);
    if (!operator || !Number.isFinite(number)) return undefined;
    if (operator === "*" || operator === "/") {
      const previous = values.pop()!;
      values.push(operator === "*" ? previous * number : previous / number);
    } else {
      operators.push(operator);
      values.push(number);
    }
  }
  return values
    .slice(1)
    .reduce(
      (total, number, index) =>
        operators[index] === "-" ? total - number : total + number,
      values[0]!,
    );
}

function inferSwahiliPlaceNumber(value: string) {
  if (!/\biwe\b/i.test(value)) return undefined;
  let total = 0;
  let matches = 0;
  for (const [place, multiplier] of Object.entries(swahiliPlaces).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    const match = value.match(
      new RegExp(`(\\d)\\s+(?:iwe\\s+)?${place}\\b`, "i"),
    );
    if (!match) continue;
    total += Number(match[1]) * multiplier;
    matches += 1;
  }
  return matches >= 2 ? total : undefined;
}

function inferPlaceValueQuery(value: string) {
  const numbers = [...value.matchAll(/\b\d+\b/g)].map((match) => match[0]);
  const namedDigit = value.match(
    /\b(?:thamani ya nafasi ya|place value of)\s+(\d)\b/i,
  )?.[1];
  if (namedDigit) {
    const whole = [...numbers]
      .reverse()
      .find((number) => number.length > 1 && number.includes(namedDigit));
    const index = whole?.indexOf(namedDigit) ?? -1;
    if (whole && index >= 0)
      return Number(namedDigit) * 10 ** (whole.length - index - 1);
  }
  const place = Object.entries(swahiliPlaces)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([name]) => new RegExp(`\\b${name}\\b`, "i").test(value));
  if (!place) return undefined;
  const [, multiplier] = place;
  const whole = [...numbers]
    .reverse()
    .find((number) => Number(number) >= multiplier);
  if (!whole) return undefined;
  if (/\b(?:tarakimu ipi|ni tarakimu|which digit)\b/i.test(value))
    return Math.floor(Number(whole) / multiplier) % 10;
  if (/\b(?:mangapi|how many)\b/i.test(value))
    return Math.floor(Number(whole) / multiplier);
  return undefined;
}

function arithmeticToLatex(value: string) {
  return value
    .replaceAll(",", "{,}")
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, "\\frac{$1}{$2}")
    .replace(/[x×]/gi, "\\times ")
    .replace(/÷/g, "\\div ")
    .replace(/−/g, "-")
    .replace(/_+/g, "\\square")
    .replace(/\?$/, "\\square");
}
function formatNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(8)));
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
  );
}
function escapeAttribute(value: string) {
  return value.replace(
    /[&"<>]/g,
    (character) =>
      ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[character]!,
  );
}

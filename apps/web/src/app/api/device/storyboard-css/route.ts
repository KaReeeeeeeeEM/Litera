import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "tailwindcss";

export const runtime = "nodejs";

let compilerPromise: ReturnType<typeof compile> | null = null;

function getCompiler() {
  compilerPromise ??= readFile(path.join(process.cwd(), "node_modules/tailwindcss/theme.css"), "utf8")
    .then(theme => compile(`${theme}\n@tailwind utilities;`));
  return compilerPromise;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { html?: string } | null;
  const html = payload?.html?.slice(0, 2_000_000) ?? "";
  const candidates = [...html.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)]
    .flatMap(match => match[1]!.split(/\s+/))
    .filter(candidate => candidate && /^[\w:[\]().,%#'"/+*-]+$/.test(candidate))
    .slice(0, 12_000);
  const unique = [...new Set(candidates)];
  const compiler = await getCompiler();
  return Response.json({ css: compiler.build(unique) });
}

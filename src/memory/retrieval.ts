import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type SearchResult = { path: string; score: number; snippet: string };

const SEARCH_DIRS = ["architecture", "stack", "policies", "distilled"] as const;
const STATIC_PATHS = new Set(["memory/policies/ai-execution-contract.md", "memory/policies/memory-lifecycle.md"]);

export function searchMemory(query: string, projectRoot?: string): SearchResult[] {
  const root = projectRoot ?? resolve(import.meta.dirname, "..", "..");
  const queryTokens = uniqueTokens(query);
  if (queryTokens.length === 0) return [];

  return collectSearchFiles(root)
    .flatMap((filePath) => scoreFile(root, filePath, queryTokens))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || compareText(left.path, right.path))
    .slice(0, 5);
}

function collectSearchFiles(root: string): string[] {
  const output: string[] = [];
  for (const directory of SEARCH_DIRS) {
    const base = resolve(root, "memory", directory);
    if (existsSync(base)) output.push(...walk(base));
  }
  return output
    .filter((path) => /\.(?:md|ya?ml)$/i.test(path))
    .filter((path) => {
      const rel = normalizePath(relative(root, path));
      if (STATIC_PATHS.has(rel) || rel.endsWith("/TEMPLATE.md")) return false;
      if (!rel.startsWith("memory/distilled/")) return true;
      return isConfirmedDistilled(path, readFileSync(path, "utf8"));
    })
    .sort();
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
  });
}

function scoreFile(root: string, filePath: string, queryTokens: readonly string[]): SearchResult[] {
  const content = readFileSync(filePath, "utf8");
  const path = normalizePath(relative(root, filePath));
  const contentTokens = new Set(uniqueTokens(content));
  const pathTokens = new Set(uniqueTokens(path));
  const titleTokens = new Set(uniqueTokens(firstHeading(content)));
  let score = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) score += 1;
    if (pathTokens.has(token)) score += 2;
    if (titleTokens.has(token)) score += 3;
  }
  return score > 0 ? [{ path, score, snippet: matchingSnippet(content, queryTokens) }] : [];
}

function uniqueTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const rawWord of text.toLowerCase().match(/[a-z0-9][a-z0-9._-]*/g) ?? []) {
    const word = rawWord.replace(/[._-]+$/, "");
    if (word.length >= 2) tokens.add(word);
    for (const part of word.split(/[._-]+/)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  for (const run of text.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? []) {
    for (const character of run) tokens.add(character);
    for (let index = 0; index < run.length - 1; index += 1) tokens.add(run.slice(index, index + 2));
  }
  return [...tokens];
}

function firstHeading(content: string): string {
  return /^#+\s+(.+)$/m.exec(content)?.[1] ?? "";
}

function matchingSnippet(content: string, queryTokens: readonly string[]): string {
  const line = content
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && queryTokens.some((token) => entry.toLowerCase().includes(token)));
  if (!line) return "";
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isConfirmedDistilled(path: string, content: string): boolean {
  const metadata = /\.md$/i.test(path)
    ? /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/.exec(content.replaceAll("\r\n", "\n"))?.[1]
    : content;
  if (metadata === undefined) return false;
  try {
    const value: unknown = Bun.YAML.parse(metadata);
    return isRecord(value) && value.confirmed_by_user === true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

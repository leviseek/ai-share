import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { contentHash, normalizePath } from "../core/ids.ts";
import type { ParserDiagnostic, RepositoryResource } from "../core/types.ts";

const DEFAULT_IGNORES = new Set([".git", "node_modules", "dist", "target", ".rie", ".worktrees", ".codex"]);
const IGNORED_FILE_NAMES = new Set(["bun.lockb"]);
const DEFAULT_MAX_FILE_BYTES = 1_000_000;

export type ScanOptions = {
  repoRoot: string;
  includeHidden?: boolean;
  ignores?: string[];
  maxFileBytes?: number;
};

export type ScanResult = {
  resources: RepositoryResource[];
  diagnostics: ParserDiagnostic[];
};

export async function scanRepository(options: ScanOptions): Promise<ScanResult> {
  const root = resolve(options.repoRoot);
  const resources: RepositoryResource[] = [];
  const diagnostics: ParserDiagnostic[] = [];
  const ignoreRules = await buildIgnoreRules(root, options.ignores ?? []);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  await walk(root, root, resources, diagnostics, {
    includeHidden: options.includeHidden === true,
    ignoreRules,
    maxFileBytes,
  });
  resources.sort((a, b) => a.path.localeCompare(b.path));
  return { resources, diagnostics };
}

type WalkOptions = {
  includeHidden: boolean;
  ignoreRules: IgnoreRule[];
  maxFileBytes: number;
};

async function walk(
  root: string,
  current: string,
  resources: RepositoryResource[],
  diagnostics: ParserDiagnostic[],
  options: WalkOptions,
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = resolve(current, entry.name);
    const path = normalizePath(relative(root, absolutePath));
    if (shouldIgnore(entry.name, path, options.includeHidden, options.ignoreRules)) continue;
    if (entry.isDirectory()) {
      resources.push({ path, absolutePath, kind: "directory" });
      await walk(root, absolutePath, resources, diagnostics, options);
      continue;
    }
    if (!entry.isFile()) continue;
    const fileStat = await stat(absolutePath);
    if (fileStat.size > options.maxFileBytes) {
      diagnostics.push({
        parser: "scanner",
        path,
        severity: "warning",
        message: `File exceeds maxFileBytes=${options.maxFileBytes}; skipped.`,
      });
      continue;
    }
    const content = await readFile(absolutePath);
    if (isProbablyBinary(content)) {
      diagnostics.push({ parser: "scanner", path, severity: "info", message: "Binary file skipped." });
      continue;
    }
    const language = detectLanguage(entry.name);
    const fileResource: RepositoryResource = {
      path,
      absolutePath,
      kind: "file",
      size: fileStat.size,
      hash: contentHash(content),
    };
    if (language !== undefined) fileResource.language = language;
    resources.push(fileResource);
  }
}

type IgnoreRule = {
  pattern: string;
  directoryOnly: boolean;
};

async function buildIgnoreRules(root: string, explicitIgnores: string[]): Promise<IgnoreRule[]> {
  const gitignore = await readGitignore(root);
  return [...gitignore, ...explicitIgnores]
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0 && !pattern.startsWith("#") && !pattern.startsWith("!"))
    .map((pattern) => ({ pattern: normalizeIgnorePattern(pattern), directoryOnly: pattern.endsWith("/") }));
}

async function readGitignore(root: string): Promise<string[]> {
  try {
    const raw = await readFile(resolve(root, ".gitignore"), "utf-8");
    return raw.split(/\r?\n/);
  } catch {
    return [];
  }
}

function normalizeIgnorePattern(pattern: string): string {
  return normalizePath(pattern.replace(/\/$/, "").replace(/^\//, ""));
}

function shouldIgnore(name: string, path: string, includeHidden: boolean, ignoreRules: IgnoreRule[]): boolean {
  if (DEFAULT_IGNORES.has(name) || IGNORED_FILE_NAMES.has(name)) return true;
  if (!includeHidden && name.startsWith(".")) return name !== ".gitignore";
  return ignoreRules.some((rule) => matchesIgnoreRule(path, name, rule));
}

function matchesIgnoreRule(path: string, name: string, rule: IgnoreRule): boolean {
  const pattern = rule.pattern;
  if (pattern.length === 0) return false;
  if (!pattern.includes("/")) return name === pattern || path.split("/").includes(pattern);
  return path === pattern || path.startsWith(`${pattern}/`);
}

function isProbablyBinary(content: Uint8Array): boolean {
  if (content.length === 0) return false;
  const sample = content.subarray(0, Math.min(content.length, 8000));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length > 0.3;
}

function detectLanguage(name: string): string | undefined {
  if (name === "package.json") return "json";
  if (name.endsWith("AGENTS.md") || name.endsWith("CODEX.md") || name.endsWith("README.md")) return "markdown";
  const ext = extname(name).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".md") return "markdown";
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  return undefined;
}

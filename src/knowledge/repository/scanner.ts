import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { contentHash, normalizePath } from "../core/ids.ts";
import type { RepositoryResource } from "../core/types.ts";

const DEFAULT_IGNORES = new Set([".git", "node_modules", "dist", "target", ".rie", ".worktrees", ".codex"]);
const IGNORED_FILE_NAMES = new Set(["bun.lockb"]);

export type ScanOptions = {
  repoRoot: string;
  includeHidden?: boolean;
};

export async function scanRepository(options: ScanOptions): Promise<RepositoryResource[]> {
  const root = resolve(options.repoRoot);
  const resources: RepositoryResource[] = [];
  await walk(root, root, resources, options.includeHidden === true);
  resources.sort((a, b) => a.path.localeCompare(b.path));
  return resources;
}

async function walk(
  root: string,
  current: string,
  resources: RepositoryResource[],
  includeHidden: boolean,
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldIgnore(entry.name, includeHidden)) continue;
    const absolutePath = resolve(current, entry.name);
    const path = normalizePath(relative(root, absolutePath));
    if (entry.isDirectory()) {
      resources.push({ path, absolutePath, kind: "directory" });
      await walk(root, absolutePath, resources, includeHidden);
      continue;
    }
    if (!entry.isFile()) continue;
    const fileStat = await stat(absolutePath);
    const content = await readFile(absolutePath);
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

function shouldIgnore(name: string, includeHidden: boolean): boolean {
  if (DEFAULT_IGNORES.has(name) || IGNORED_FILE_NAMES.has(name)) return true;
  if (!includeHidden && name.startsWith(".")) return name !== ".gitignore";
  return false;
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

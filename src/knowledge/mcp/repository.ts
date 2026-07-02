import { stat } from "node:fs/promises";
import { resolve } from "node:path";

export type RepositorySelectionReason = "session-default" | "explicit-override";

export type RepositorySelection = {
  defaultRepoRoot: string;
  effectiveRepoRoot: string;
  selectionReason: RepositorySelectionReason;
  overrideRepoRoot?: string;
};

export type RepositorySelectionInput = {
  cwd?: string;
  repoRoot?: string;
};

export async function resolveRepositorySelection(input: RepositorySelectionInput = {}): Promise<RepositorySelection> {
  const defaultRepoRoot = resolve(input.cwd ?? process.cwd());
  const overrideRepoRoot = input.repoRoot === undefined ? undefined : resolve(input.repoRoot);
  const effectiveRepoRoot = overrideRepoRoot ?? defaultRepoRoot;
  await assertDirectory(effectiveRepoRoot);
  return {
    defaultRepoRoot,
    effectiveRepoRoot,
    selectionReason: overrideRepoRoot === undefined ? "session-default" : "explicit-override",
    ...(overrideRepoRoot === undefined ? {} : { overrideRepoRoot }),
  };
}

async function assertDirectory(path: string): Promise<void> {
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) return;
  } catch {
    // fall through to stable public error
  }
  throw new Error(`repository path must be an existing directory: ${path}`);
}

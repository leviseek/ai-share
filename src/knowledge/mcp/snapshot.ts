import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BuildResult } from "../core/types.ts";
import { buildKnowledge } from "../index.ts";
import { buildStats, createJsonlKnowledgeStore, readBuildResult, writeBuildResult } from "../storage/jsonl-store.ts";
import type { RepositorySelectionInput } from "./repository.ts";
import { resolveRepositorySelection } from "./repository.ts";
import type { SnapshotStatus, SnapshotSummary } from "./types.ts";

const DEFAULT_STORE_DIR = ".rie";
const IGNORED_DIRS = new Set([".git", "node_modules", ".rie", ".worktrees", ".codex", "dist", "build"]);

export type SnapshotInput = RepositorySelectionInput & {
  store?: string;
  refresh?: boolean;
};

export type LoadedRepositorySnapshot = {
  result: BuildResult;
  snapshot: SnapshotSummary;
};

export async function getSnapshotStatus(input: SnapshotInput): Promise<SnapshotSummary> {
  const selection = await resolveRepositorySelection(input);
  const repoRoot = selection.effectiveRepoRoot;
  const storeDir = resolve(repoRoot, input.store ?? DEFAULT_STORE_DIR);
  const store = createJsonlKnowledgeStore(storeDir);
  try {
    const result = await readBuildResult(store);
    return await summarizeSnapshot(result, repoRoot, storeDir);
  } catch {
    return emptySummary("missing", repoRoot, storeDir, [
      "Run or allow automatic RIE knowledge build for this repository.",
    ]);
  }
}

export async function loadRepositorySnapshot(input: SnapshotInput): Promise<LoadedRepositorySnapshot> {
  const selection = await resolveRepositorySelection(input);
  const repoRoot = selection.effectiveRepoRoot;
  const storeDir = resolve(repoRoot, input.store ?? DEFAULT_STORE_DIR);
  const store = createJsonlKnowledgeStore(storeDir);
  const current = await getSnapshotStatus({ ...input, repoRoot });

  if (
    current.status === "missing" ||
    current.status === "mismatched" ||
    (current.status === "stale" && input.refresh)
  ) {
    const result = await buildKnowledge({ repoRoot });
    await writeBuildResult(store, result);
    return { result, snapshot: await summarizeSnapshot(result, repoRoot, storeDir) };
  }

  const result = await readBuildResult(store);
  return { result, snapshot: current };
}

async function summarizeSnapshot(result: BuildResult, repoRoot: string, storeDir: string): Promise<SnapshotSummary> {
  const stats = buildStats(result);
  const objectCount = numberStat(stats.objects);
  const edgeCount = numberStat(stats.edges);
  const diagnosticCount = numberStat(stats.diagnostics);
  const status = await classifySnapshot(result, repoRoot, objectCount);
  return {
    status,
    repoRoot,
    storeDir,
    buildHash: result.metadata.buildHash,
    schemaVersion: result.metadata.schemaVersion,
    builtAt: result.metadata.builtAt,
    objectCount,
    edgeCount,
    diagnosticCount,
    recoveryActions: recoveryActions(status),
  };
}

async function classifySnapshot(result: BuildResult, repoRoot: string, objectCount: number): Promise<SnapshotStatus> {
  if (resolve(result.metadata.repoRoot) !== resolve(repoRoot)) return "mismatched";
  if (objectCount === 0) return "empty";
  const builtAtMs = Date.parse(result.metadata.builtAt);
  if (Number.isFinite(builtAtMs) && (await latestSourceMtime(repoRoot)) > builtAtMs) return "stale";
  return "current";
}

async function latestSourceMtime(root: string): Promise<number> {
  let latest = 0;
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(path);
      latest = Math.max(latest, info.mtimeMs);
    }
  }
  await visit(root);
  return latest;
}

function emptySummary(
  status: SnapshotStatus,
  repoRoot: string,
  storeDir: string,
  recoveryActions: string[],
): SnapshotSummary {
  return { status, repoRoot, storeDir, objectCount: 0, edgeCount: 0, diagnosticCount: 0, recoveryActions };
}

function recoveryActions(status: SnapshotStatus): string[] {
  if (status === "missing") return ["Allow automatic RIE knowledge build for this repository."];
  if (status === "stale") return ["Refresh the RIE knowledge snapshot for this repository."];
  if (status === "empty") return ["Check repository path and build inputs; snapshot has no knowledge objects."];
  if (status === "mismatched") return ["Select the correct repository path or rebuild the snapshot."];
  return [];
}

function numberStat(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

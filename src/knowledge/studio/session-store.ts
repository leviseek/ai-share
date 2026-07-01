import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  CodexDryRun,
  ContextExperiment,
  ContextExperimentSummary,
  ContextRecipe,
  ContextRecipeSummary,
} from "./data.ts";
import type { CodexPlanExec, PlanExecStreamEvent } from "./plan-exec.ts";

export type StudioSessionSummary = {
  id: string;
  kind: "dry-run" | "plan-exec";
  timestamp: string;
  prompt: string;
  intent: string;
  traceSteps: string[];
  bundleHash: string;
  exitCode?: number | null;
  durationMs?: number;
  guardOk?: boolean;
  recipeId?: string;
  recipeName?: string;
};

export type StudioSessionDetail = CodexDryRun | CodexPlanExec;

export type StudioSessionStore = {
  append(summary: StudioSessionSummary): Promise<void>;
  recent(limit: number): Promise<StudioSessionSummary[]>;
  writeDetail(id: string, detail: StudioSessionDetail): Promise<void>;
  readDetail(id: string): Promise<StudioSessionDetail | undefined>;
  appendEvent(id: string, event: PlanExecStreamEvent): Promise<void>;
  readEvents(id: string): Promise<PlanExecStreamEvent[]>;
};

export type ContextExperimentStore = {
  append(summary: ContextExperimentSummary): Promise<void>;
  recent(limit: number): Promise<ContextExperimentSummary[]>;
  writeDetail(id: string, detail: ContextExperiment): Promise<void>;
  readDetail(id: string): Promise<ContextExperiment | undefined>;
};

export type ContextRecipeStore = {
  append(summary: ContextRecipeSummary): Promise<void>;
  recent(limit: number): Promise<ContextRecipeSummary[]>;
  writeDetail(id: string, detail: ContextRecipe): Promise<void>;
  readDetail(id: string): Promise<ContextRecipe | undefined>;
};

export class JsonlStudioSessionStore implements StudioSessionStore {
  readonly path: string;
  readonly runsRoot: string;

  constructor(repoRoot: string) {
    this.path = resolve(repoRoot, ".rie", "studio", "sessions.jsonl");
    this.runsRoot = resolve(repoRoot, ".rie", "studio", "runs");
  }

  async append(summary: StudioSessionSummary): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const existing = await readTextIfExists(this.path);
    await writeFile(this.path, `${existing}${JSON.stringify(summary)}\n`);
  }

  async recent(limit: number): Promise<StudioSessionSummary[]> {
    const raw = await readTextIfExists(this.path);
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StudioSessionSummary)
      .slice(-limit)
      .reverse();
  }

  async writeDetail(id: string, detail: StudioSessionDetail): Promise<void> {
    assertSafeSessionId(id);
    await mkdir(this.runsRoot, { recursive: true });
    await writeFile(resolve(this.runsRoot, `${id}.json`), `${JSON.stringify(detail, null, 2)}\n`);
  }

  async readDetail(id: string): Promise<StudioSessionDetail | undefined> {
    assertSafeSessionId(id);
    const raw = await readTextIfExists(resolve(this.runsRoot, `${id}.json`));
    if (raw.length === 0) return undefined;
    return JSON.parse(raw) as StudioSessionDetail;
  }

  async appendEvent(id: string, event: PlanExecStreamEvent): Promise<void> {
    assertSafeSessionId(id);
    await mkdir(this.runsRoot, { recursive: true });
    const path = resolve(this.runsRoot, `${id}.events.jsonl`);
    const existing = await readTextIfExists(path);
    await writeFile(path, `${existing}${JSON.stringify(event)}\n`);
  }

  async readEvents(id: string): Promise<PlanExecStreamEvent[]> {
    assertSafeSessionId(id);
    const raw = await readTextIfExists(resolve(this.runsRoot, `${id}.events.jsonl`));
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as PlanExecStreamEvent);
  }
}

export function createStudioSessionStore(repoRoot: string): StudioSessionStore {
  return new JsonlStudioSessionStore(repoRoot);
}

export class JsonlContextExperimentStore implements ContextExperimentStore {
  readonly path: string;
  readonly experimentsRoot: string;

  constructor(repoRoot: string) {
    this.path = resolve(repoRoot, ".rie", "studio", "experiments.jsonl");
    this.experimentsRoot = resolve(repoRoot, ".rie", "studio", "experiments");
  }

  async append(summary: ContextExperimentSummary): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const existing = await readTextIfExists(this.path);
    await writeFile(this.path, `${existing}${JSON.stringify(summary)}\n`);
  }

  async recent(limit: number): Promise<ContextExperimentSummary[]> {
    const raw = await readTextIfExists(this.path);
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ContextExperimentSummary)
      .slice(-limit)
      .reverse();
  }

  async writeDetail(id: string, detail: ContextExperiment): Promise<void> {
    assertSafeSessionId(id);
    await mkdir(this.experimentsRoot, { recursive: true });
    await writeFile(resolve(this.experimentsRoot, `${id}.json`), `${JSON.stringify(detail, null, 2)}\n`);
  }

  async readDetail(id: string): Promise<ContextExperiment | undefined> {
    assertSafeSessionId(id);
    const raw = await readTextIfExists(resolve(this.experimentsRoot, `${id}.json`));
    if (raw.length === 0) return undefined;
    return JSON.parse(raw) as ContextExperiment;
  }
}

export function createContextExperimentStore(repoRoot: string): ContextExperimentStore {
  return new JsonlContextExperimentStore(repoRoot);
}

export class JsonlContextRecipeStore implements ContextRecipeStore {
  readonly path: string;
  readonly recipesRoot: string;

  constructor(repoRoot: string) {
    this.path = resolve(repoRoot, ".rie", "studio", "recipes.jsonl");
    this.recipesRoot = resolve(repoRoot, ".rie", "studio", "recipes");
  }

  async append(summary: ContextRecipeSummary): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const existing = await readTextIfExists(this.path);
    await writeFile(this.path, `${existing}${JSON.stringify(summary)}\n`);
  }

  async recent(limit: number): Promise<ContextRecipeSummary[]> {
    const raw = await readTextIfExists(this.path);
    const byId = new Map<string, ContextRecipeSummary>();
    for (const line of raw.split(/\r?\n/).filter((item) => item.trim().length > 0)) {
      const summary = JSON.parse(line) as ContextRecipeSummary;
      byId.set(summary.id, summary);
    }
    return [...byId.values()]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(-limit)
      .reverse();
  }

  async writeDetail(id: string, detail: ContextRecipe): Promise<void> {
    assertSafeSessionId(id);
    await mkdir(this.recipesRoot, { recursive: true });
    await writeFile(resolve(this.recipesRoot, `${id}.json`), `${JSON.stringify(detail, null, 2)}\n`);
  }

  async readDetail(id: string): Promise<ContextRecipe | undefined> {
    assertSafeSessionId(id);
    const raw = await readTextIfExists(resolve(this.recipesRoot, `${id}.json`));
    if (raw.length === 0) return undefined;
    return JSON.parse(raw) as ContextRecipe;
  }
}

export function createContextRecipeStore(repoRoot: string): ContextRecipeStore {
  return new JsonlContextRecipeStore(repoRoot);
}

function assertSafeSessionId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("非法 session id。");
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

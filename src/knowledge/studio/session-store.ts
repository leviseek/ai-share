import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
};

export type StudioSessionStore = {
  append(summary: StudioSessionSummary): Promise<void>;
  recent(limit: number): Promise<StudioSessionSummary[]>;
};

export class JsonlStudioSessionStore implements StudioSessionStore {
  readonly path: string;

  constructor(repoRoot: string) {
    this.path = resolve(repoRoot, ".rie", "studio", "sessions.jsonl");
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
}

export function createStudioSessionStore(repoRoot: string): StudioSessionStore {
  return new JsonlStudioSessionStore(repoRoot);
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

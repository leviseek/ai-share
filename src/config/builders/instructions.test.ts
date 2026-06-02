import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { buildInstructionsPaths as facadeBuildInstructionsPaths } from "../../config-builders.ts";
import { buildInstructionsPaths as opencodeBuildInstructionsPaths } from "./opencode.ts";

type BuildInstructionsPaths = typeof opencodeBuildInstructionsPaths;

const structuredMemoryRelativePaths = [
  "memory/user/profile.md",
  "memory/user/profile.yaml",
  "memory/user/workflow.md",
  "memory/user/workflows.yaml",
  "memory/user/preferences.md",
  "memory/user/devices.md",
  "memory/user/devices.yaml",
  "memory/user/toolchain.md",
  "memory/user/prompts.md",
  "memory/user/models.yaml",
  "memory/architecture/coding-philosophy.md",
  "memory/architecture/agent-patterns.md",
  "memory/architecture/ai-desktop.md",
  "memory/stack/opencode.md",
  "memory/stack/oh-my-openagent.md",
  "memory/stack/wsl.md",
  "memory/stack/models.md",
] as const;

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildInstructionsPaths", () => {
  test("keeps AI_GUIDELINES.md first and preserves shared structured memory order", () => {
    const root = makeProjectRoot();

    const paths = withoutAiomoTask(() => opencodeBuildInstructionsPaths(root));

    expect(paths).toEqual([
      resolve(root, "AI_GUIDELINES.md"),
      ...structuredMemoryRelativePaths.map((path) => resolve(root, path)),
    ]);
  });

  test("inserts task-specific memory after AI_GUIDELINES.md and before structured memory", () => {
    const root = makeProjectRoot();
    writeMemory(root, "memory/stable/task-priority.yaml", 'topic: "codexboundary uniquepriority regression"');
    writeMemory(root, "memory/stable/distractor-a.yaml", 'topic: "ordinary baseline context"');
    writeMemory(root, "memory/stable/distractor-b.yaml", 'topic: "unrelated generated config note"');

    const paths = withoutAiomoTask(() => opencodeBuildInstructionsPaths(root, undefined, "uniquepriority"));

    expect(paths[0]).toBe(resolve(root, "AI_GUIDELINES.md"));
    expect(paths[1]).toBe(resolve(root, "memory/stable/task-priority.yaml"));
    expect(paths.indexOf(resolve(root, "memory/user/profile.md"))).toBeGreaterThan(1);
  });

  test("uses AIOMO_TASK as the task memory fallback and restores caller environment", () => {
    const root = makeProjectRoot();
    writeMemory(root, "memory/profiles/fallback-task.yaml", 'task: "aiomotaskfallback sentinel-memory"');
    writeMemory(root, "memory/profiles/distractor-a.yaml", 'task: "ordinary profile context"');
    writeMemory(root, "memory/profiles/distractor-b.yaml", 'task: "unrelated profile note"');

    const previousTask = process.env.AIOMO_TASK;
    process.env.AIOMO_TASK = "sentinel-memory";

    try {
      const paths = opencodeBuildInstructionsPaths(root);

      expect(paths[0]).toBe(resolve(root, "AI_GUIDELINES.md"));
      expect(paths[1]).toBe(resolve(root, "memory/profiles/fallback-task.yaml"));
    } finally {
      restoreAiomoTask(previousTask);
    }

    if (previousTask === undefined) {
      expect(process.env.AIOMO_TASK).toBeUndefined();
    } else {
      expect(process.env.AIOMO_TASK).toBe(previousTask);
    }
  });

  test("appends existing profile memory after shared structured memory and skips missing profile files", () => {
    const root = makeProjectRoot();
    writeMemory(root, "memory/stable/user.yaml", 'user: "profile append"');
    writeMemory(root, "memory/profiles/coding.yaml", 'coding: "profile append"');

    const paths = withoutAiomoTask(() => opencodeBuildInstructionsPaths(root, "coding"));

    expect(paths.slice(-2)).toEqual([
      resolve(root, "memory/stable/user.yaml"),
      resolve(root, "memory/profiles/coding.yaml"),
    ]);
    expect(paths).not.toContain(resolve(root, "memory/stable/workflows.yaml"));
    expect(paths).not.toContain(resolve(root, "memory/stable/devices.yaml"));
  });

  test("keeps public compatibility exports aligned with the active instruction builder", async () => {
    const root = makeProjectRoot();

    expect(facadeBuildInstructionsPaths).toBe(opencodeBuildInstructionsPaths);
    expect(facadeBuildInstructionsPaths(root)).toEqual(opencodeBuildInstructionsPaths(root));

    const neutralBuildInstructionsPaths = await loadNeutralBuilderIfPresent();
    if (neutralBuildInstructionsPaths !== undefined) {
      expect(facadeBuildInstructionsPaths).toBe(neutralBuildInstructionsPaths);
      expect(opencodeBuildInstructionsPaths).toBe(neutralBuildInstructionsPaths);
      expect(neutralBuildInstructionsPaths(root)).toEqual(opencodeBuildInstructionsPaths(root));
    }
  });
});

function makeProjectRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "ai-share-instructions-"));
  tempRoots.push(root);
  writeFileSync(resolve(root, "AI_GUIDELINES.md"), "# Guidelines\n");
  mkdirSync(resolve(root, "memory"), { recursive: true });
  return root;
}

function writeMemory(projectRoot: string, relativePath: string, content: string): void {
  const filePath = resolve(projectRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${content}\n`);
}

function withoutAiomoTask<T>(callback: () => T): T {
  const previousTask = process.env.AIOMO_TASK;
  delete process.env.AIOMO_TASK;
  try {
    return callback();
  } finally {
    restoreAiomoTask(previousTask);
  }
}

function restoreAiomoTask(previousTask: string | undefined): void {
  if (previousTask === undefined) {
    delete process.env.AIOMO_TASK;
    return;
  }

  process.env.AIOMO_TASK = previousTask;
}

async function loadNeutralBuilderIfPresent(): Promise<BuildInstructionsPaths | undefined> {
  const neutralModuleUrl = new URL("./instructions.ts", import.meta.url);
  if (!existsSync(neutralModuleUrl)) {
    return undefined;
  }

  const moduleValue: unknown = await import(neutralModuleUrl.href);
  if (typeof moduleValue !== "object" || moduleValue === null || !("buildInstructionsPaths" in moduleValue)) {
    throw new Error("src/config/builders/instructions.ts does not export buildInstructionsPaths");
  }

  const buildInstructionsPaths = moduleValue.buildInstructionsPaths;
  if (typeof buildInstructionsPaths !== "function") {
    throw new TypeError("buildInstructionsPaths export is not a function");
  }

  return buildInstructionsPaths as BuildInstructionsPaths;
}

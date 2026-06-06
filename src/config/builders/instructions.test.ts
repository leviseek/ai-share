import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { buildInstructionsPaths as facadeBuildInstructionsPaths } from "../../config-builders.ts";
import { buildInstructionsPaths } from "./instructions.ts";

type BuildInstructionsPaths = typeof buildInstructionsPaths;

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

    const paths = withoutTask(() => buildInstructionsPaths(root));

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

    const paths = withoutTask(() => buildInstructionsPaths(root, undefined, "uniquepriority"));

    expect(paths[0]).toBe(resolve(root, "AI_GUIDELINES.md"));
    expect(paths[1]).toBe(resolve(root, "memory/stable/task-priority.yaml"));
    expect(paths.indexOf(resolve(root, "memory/user/profile.md"))).toBeGreaterThan(1);
  });

  test("uses AI_SHARE_TASK as the task memory fallback and restores caller environment", () => {
    const root = makeProjectRoot();
    writeMemory(root, "memory/profiles/fallback-task.yaml", 'task: "taskfallback sentinel-memory"');
    writeMemory(root, "memory/profiles/distractor-a.yaml", 'task: "ordinary profile context"');
    writeMemory(root, "memory/profiles/distractor-b.yaml", 'task: "unrelated profile note"');

    const previousTask = process.env.AI_SHARE_TASK;
    process.env.AI_SHARE_TASK = "sentinel-memory";

    try {
      const paths = buildInstructionsPaths(root);

      expect(paths[0]).toBe(resolve(root, "AI_GUIDELINES.md"));
      expect(paths[1]).toBe(resolve(root, "memory/profiles/fallback-task.yaml"));
    } finally {
      restoreTask(previousTask);
    }

    if (previousTask === undefined) {
      expect(process.env.AI_SHARE_TASK).toBeUndefined();
    } else {
      expect(process.env.AI_SHARE_TASK).toBe(previousTask);
    }
  });

  test("appends existing profile memory after shared structured memory and skips missing profile files", () => {
    const root = makeProjectRoot();
    writeMemory(root, "memory/stable/user.yaml", 'user: "profile append"');
    writeMemory(root, "memory/profiles/coding.yaml", 'coding: "profile append"');

    const paths = withoutTask(() => buildInstructionsPaths(root, "coding"));

    expect(paths.slice(-2)).toEqual([
      resolve(root, "memory/stable/user.yaml"),
      resolve(root, "memory/profiles/coding.yaml"),
    ]);
    expect(paths).not.toContain(resolve(root, "memory/stable/workflows.yaml"));
    expect(paths).not.toContain(resolve(root, "memory/stable/devices.yaml"));
  });

  test("loads full memory set for ds-max profile", () => {
    const root = makeProjectRoot();
    const fullMemoryFiles = [
      "memory/stable/user.yaml",
      "memory/stable/workflows.yaml",
      "memory/stable/devices.yaml",
      "memory/profiles/coding.yaml",
      "memory/profiles/research.yaml",
      "memory/profiles/infra.yaml",
      "memory/policies/memory-policy.yaml",
    ];
    for (const relativePath of fullMemoryFiles) {
      writeMemory(root, relativePath, `${relativePath}: "ds-max memory"`);
    }

    const paths = withoutTask(() => buildInstructionsPaths(root, "ds-max"));

    expect(paths.slice(-fullMemoryFiles.length)).toEqual(fullMemoryFiles.map((path) => resolve(root, path)));
  });

  test("keeps public compatibility exports aligned with the active instruction builder", async () => {
    const root = makeProjectRoot();

    expect(facadeBuildInstructionsPaths).toBe(buildInstructionsPaths);
    expect(facadeBuildInstructionsPaths(root)).toEqual(buildInstructionsPaths(root));

    const neutralBuildInstructionsPaths = await loadNeutralBuilderIfPresent();
    if (neutralBuildInstructionsPaths !== undefined) {
      expect(facadeBuildInstructionsPaths).toBe(neutralBuildInstructionsPaths);
      expect(buildInstructionsPaths).toBe(neutralBuildInstructionsPaths);
      expect(neutralBuildInstructionsPaths(root)).toEqual(buildInstructionsPaths(root));
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

function withoutTask<T>(callback: () => T): T {
  const previousTask = process.env.AI_SHARE_TASK;
  delete process.env.AI_SHARE_TASK;
  try {
    return callback();
  } finally {
    restoreTask(previousTask);
  }
}

function restoreTask(previousTask: string | undefined): void {
  if (previousTask === undefined) {
    delete process.env.AI_SHARE_TASK;
    return;
  }

  process.env.AI_SHARE_TASK = previousTask;
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

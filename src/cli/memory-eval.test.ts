import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { evaluateMemoryRuntime } from "./memory-eval.ts";

const projectRoot = resolve(import.meta.dir, "..", "..");

describe("memory eval", () => {
  test("passes the repository memory runtime checks offline", async () => {
    const results = await evaluateMemoryRuntime(projectRoot);

    expect(results.map((result) => result.task)).toEqual([
      "base_instructions",
      "task_retrieval",
      "retrieval_policy",
      "skill_install_plan",
    ]);
    expect(results.every((result) => result.status === "pass")).toBe(true);
  });

  test("returns task names and failure reasons without throwing", async () => {
    const root = makeRoot();
    try {
      writeFile(root, "AI_GUIDELINES.md", "# Guidelines\n");

      const results = await evaluateMemoryRuntime(root);

      expect(results.some((result) => result.status === "fail")).toBe(true);
      expect(results.every((result) => result.task.length > 0 && result.reason.length > 0)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-memory-eval-"));
}

function writeFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

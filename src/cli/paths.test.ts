import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildGeneratorPaths } from "./paths.ts";

describe("generator paths", () => {
  test("fails immediately when HOME and USERPROFILE are unavailable", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-paths-"));
    try {
      expect(() => buildGeneratorPaths(root, {})).toThrow("HOME 或 USERPROFILE");
      expect(existsSync(resolve(root, ".codex"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("derives only Codex output paths from an explicit home", () => {
    const root = resolve("fixture-project");
    const home = resolve("fixture-home");
    const paths = buildGeneratorPaths(root, { HOME: home });
    expect(paths.targetCodexConfigDir).toBe(resolve(home, ".codex"));
    expect(Object.keys(paths).sort()).toEqual([
      "configDir",
      "homeDir",
      "projectRoot",
      "targetCodexAgentsDir",
      "targetCodexConfig",
      "targetCodexConfigDir",
      "targetCodexEnv",
      "targetCodexInstructions",
      "targetCodexSkillsDir",
    ]);
  });

  test("rejects relative HOME and CODEX_HOME paths", () => {
    expect(() => buildGeneratorPaths(resolve("fixture-project"), { HOME: "relative-home" })).toThrow("绝对路径");
    expect(() =>
      buildGeneratorPaths(resolve("fixture-project"), { HOME: resolve("fixture-home"), CODEX_HOME: "relative" }),
    ).toThrow("CODEX_HOME 必须是非空绝对路径");
  });
});

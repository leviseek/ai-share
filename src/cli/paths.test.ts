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
      expect(existsSync(resolve(root, ".config", "opencode"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("derives OpenCode config, skills and aioc launcher paths from an explicit home", () => {
    const root = resolve("fixture-project");
    const home = resolve("fixture-home");
    const paths = buildGeneratorPaths(root, { HOME: home });
    expect(paths.targetOpenCodeConfigDir).toBe(resolve(home, ".config", "opencode"));
    expect(paths.targetOpenCodeConfig).toBe(resolve(home, ".config", "opencode", "opencode.jsonc"));
    expect(paths.targetOpenCodeSkillsDir).toBe(resolve(home, ".config", "opencode", "skills"));
    expect(paths.targetUserBinDir).toBe(resolve(home, ".local", "bin"));
    expect(paths.targetAiocScript).toBe(resolve(home, ".local", "bin", "aioc.ts"));
  });

  test("accepts an absolute OPENCODE_CONFIG_DIR and rejects relative paths", () => {
    const project = resolve("fixture-project");
    const home = resolve("fixture-home");
    const configDir = resolve("custom-opencode");
    expect(buildGeneratorPaths(project, { HOME: home, OPENCODE_CONFIG_DIR: configDir }).targetOpenCodeConfigDir).toBe(
      configDir,
    );
    expect(() => buildGeneratorPaths(project, { HOME: "relative-home" })).toThrow("绝对路径");
    expect(() => buildGeneratorPaths(project, { HOME: home, OPENCODE_CONFIG_DIR: "relative" })).toThrow(
      "OPENCODE_CONFIG_DIR 必须是非空绝对路径",
    );
  });
});

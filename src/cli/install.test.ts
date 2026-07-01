import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { installLaunchers, installNativeSkills } from "./install.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";
import type { GeneratorPaths } from "./paths.ts";

describe("install contract", () => {
  test("installs native skills atomically and preserves existing files without force", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-install-"));
    try {
      const paths = testPaths(root);
      const firstSkill = requireFirstNativeSkill();
      const existingSkillPath = join(paths.targetCodexSkillsDir, firstSkill.name, "SKILL.md");
      mkdirSync(dirname(existingSkillPath), { recursive: true });
      writeFileSync(existingSkillPath, "existing\n");

      let error: unknown;
      try {
        await installNativeSkills(paths, false, false);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("目标已存在");
      expect(readFileSync(existingSkillPath, "utf8")).toBe("existing\n");

      await installNativeSkills(paths, false, true);

      expect(readFileSync(existingSkillPath, "utf8")).toBe(firstSkill.content);
      expect(hasAtomicTempFile(paths.targetCodexSkillsDir)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not install custom launchers", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-install-"));
    try {
      const paths = testPaths(root);
      await installLaunchers(paths, false);
      expect(existsSync(paths.targetBinDir)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function testPaths(root: string): GeneratorPaths {
  const homeDir = join(root, "home");
  const targetCodexConfigDir = join(root, "codex-home");
  return {
    projectRoot: root,
    configDir: join(root, "config"),
    binDir: join(root, "bin"),
    aiWorkspaceDir: join(homeDir, "ai-workspace"),
    workspaceAiShareDir: join(homeDir, "ai-workspace", "ai-share"),
    homeDir,
    targetCodexConfigDir,
    targetCodexConfig: join(targetCodexConfigDir, "config.toml"),
    targetCodexEnv: join(targetCodexConfigDir, ".env"),
    targetCodexInstructions: join(targetCodexConfigDir, "AGENTS.md"),
    targetRuntimeManifest: join(targetCodexConfigDir, "ai-share.runtime.json"),
    targetBinDir: join(homeDir, ".local", "bin"),
    targetCodexSkillsDir: join(targetCodexConfigDir, "skills"),
  };
}

function requireFirstNativeSkill(): (typeof NATIVE_SKILLS)[number] {
  const firstSkill = NATIVE_SKILLS[0];
  if (!firstSkill) throw new Error("NATIVE_SKILLS must contain at least one skill");
  return firstSkill;
}

function hasAtomicTempFile(path: string): boolean {
  if (!existsSync(path)) return false;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name.endsWith(".tmp")) return true;
    if (entry.isDirectory() && hasAtomicTempFile(join(path, entry.name))) return true;
  }
  return false;
}

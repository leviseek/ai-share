import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
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

  test("installs launchers through atomic target writes", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-install-"));
    const restorePath = withTargetBinInPath(join(root, "home", ".local", "bin"));
    try {
      const paths = testPaths(root);
      mkdirSync(paths.binDir, { recursive: true });
      for (const launcher of expectedLaunchers()) {
        writeFileSync(
          join(paths.binDir, launcher),
          launcher.endsWith(".ps1") ? "Write-Output aiomx\n" : `${launcher}\n`,
        );
      }

      await installLaunchers(paths, false);

      for (const launcher of expectedLaunchers()) {
        const launcherPath = join(paths.targetBinDir, launcher);
        expect(existsSync(launcherPath)).toBe(true);
        if (process.platform === "win32" && launcher.endsWith(".ps1")) {
          expect(Array.from(readFileSync(launcherPath).subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        }
        if (process.platform !== "win32" && launcher === "aiomx") {
          expect((statSync(launcherPath).mode & 0o111) !== 0).toBe(true);
        }
      }
      expect(hasAtomicTempFile(paths.targetBinDir)).toBe(false);
    } finally {
      restorePath();
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
    targetCodexAgentDir: join(targetCodexConfigDir, "agents"),
    targetCodexConfig: join(targetCodexConfigDir, "config.toml"),
    targetCodexEnv: join(targetCodexConfigDir, ".env"),
    targetCodexInstructions: join(targetCodexConfigDir, "AGENTS.md"),
    targetOmxConfig: join(targetCodexConfigDir, ".omx-config.json"),
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

function expectedLaunchers(): string[] {
  return process.platform === "win32" ? ["aiomx.cmd", "aiomx.ps1", "aiomx.ts"] : ["aiomx", "aiomx.ts"];
}

function withTargetBinInPath(targetBin: string): () => void {
  const previousPath = process.env.Path;
  const previousPATH = process.env.PATH;
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const pathValue = `${targetBin}${delimiter}${process.env[pathKey] ?? process.env.PATH ?? ""}`;
  process.env[pathKey] = pathValue;
  process.env.PATH = pathValue;
  return () => {
    restorePathEnv(previousPath, previousPATH);
  };
}

function restorePathEnv(previousPath: string | undefined, previousPATH: string | undefined): void {
  if (previousPath === undefined) {
    delete process.env.Path;
  } else {
    process.env.Path = previousPath;
  }

  if (previousPATH === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = previousPATH;
  }
}

function hasAtomicTempFile(path: string): boolean {
  if (!existsSync(path)) return false;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name.endsWith(".tmp")) return true;
    if (entry.isDirectory() && hasAtomicTempFile(join(path, entry.name))) return true;
  }
  return false;
}

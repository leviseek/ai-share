import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CODEX_ENV_MANAGED_BEGIN, CODEX_ENV_MANAGED_END } from "../config/builders/env.ts";
import { cleanCodexConfig } from "./clean.ts";
import {
  GENERATED_CONFIG_HEADER,
  GENERATED_INSTRUCTIONS_MARKER,
  LEGACY_RUNTIME_MANIFEST,
  SKILL_MANAGED_CONTENT,
  SKILL_MANAGED_MARKER,
} from "./generation-plan.ts";
import type { GeneratorPaths } from "./paths.ts";

describe("surgical clean", () => {
  test("removes only marked outputs and preserves private Codex content", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const managedSkill = join(paths.targetCodexSkillsDir, "managed-skill");
      const userSkill = join(paths.targetCodexSkillsDir, "user-skill");
      const invalidMarkerSkill = join(paths.targetCodexSkillsDir, "invalid-marker");
      const malformedManifest = join(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST);
      write(paths.targetCodexConfig, `${GENERATED_CONFIG_HEADER}\nmodel = "test"\n`);
      write(paths.targetCodexInstructions, `${GENERATED_INSTRUCTIONS_MARKER}\n`);
      write(
        paths.targetCodexEnv,
        `PRIVATE_FLAG=1\n\n${CODEX_ENV_MANAGED_BEGIN}\nHTTP_PROXY=http://127.0.0.1:7897\n${CODEX_ENV_MANAGED_END}\n`,
      );
      write(join(managedSkill, "SKILL.md"), "managed\n");
      write(join(managedSkill, SKILL_MANAGED_MARKER), SKILL_MANAGED_CONTENT);
      write(join(userSkill, "SKILL.md"), "user\n");
      write(join(invalidMarkerSkill, "SKILL.md"), "user\n");
      write(join(invalidMarkerSkill, SKILL_MANAGED_MARKER), "not-ai-share\n");
      write(join(paths.targetCodexConfigDir, "user.toml"), "user\n");
      write(malformedManifest, "{ malformed\n");

      const result = await cleanCodexConfig(paths, { backup: false });

      expect(result.changed.length).toBeGreaterThan(0);
      expect(existsSync(paths.targetCodexConfig)).toBe(false);
      expect(existsSync(paths.targetCodexInstructions)).toBe(false);
      expect(readFileSync(paths.targetCodexEnv, "utf8")).toBe("PRIVATE_FLAG=1\n");
      expect(existsSync(managedSkill)).toBe(false);
      expect(readFileSync(join(userSkill, "SKILL.md"), "utf8")).toBe("user\n");
      expect(readFileSync(join(invalidMarkerSkill, "SKILL.md"), "utf8")).toBe("user\n");
      expect(readFileSync(join(paths.targetCodexConfigDir, "user.toml"), "utf8")).toBe("user\n");
      expect(readFileSync(malformedManifest, "utf8")).toBe("{ malformed\n");
      expect(existsSync(paths.targetCodexConfigDir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses a valid legacy manifest for one-time cleanup and backs up affected targets", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const legacySkill = join(paths.targetCodexSkillsDir, "legacy-skill");
      const manifest = join(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST);
      write(paths.targetCodexConfig, "# legacy generated config\n");
      write(join(legacySkill, "SKILL.md"), "legacy\n");
      write(
        manifest,
        `${JSON.stringify({
          version: 4,
          primary_stack: "codex",
          scope: "user",
          paths: { codex_home: paths.targetCodexConfigDir, codex_skills: paths.targetCodexSkillsDir },
          managed: { codex_config: paths.targetCodexConfig, skills: ["legacy-skill"] },
        })}\n`,
      );

      const result = await cleanCodexConfig(paths, { backup: true });

      expect(result.backupPath).toBeDefined();
      const backup = requireString(result.backupPath);
      expect(readFileSync(join(backup, "config.toml"), "utf8")).toBe("# legacy generated config\n");
      expect(readFileSync(join(backup, "skills", "legacy-skill", "SKILL.md"), "utf8")).toBe("legacy\n");
      expect(existsSync(join(backup, LEGACY_RUNTIME_MANIFEST))).toBe(true);
      expect(existsSync(paths.targetCodexConfig)).toBe(false);
      expect(existsSync(legacySkill)).toBe(false);
      expect(existsSync(manifest)).toBe(false);
      expect(existsSync(paths.targetCodexConfigDir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("preserves an incomplete env marker instead of deleting user content", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const content = "PRIVATE_FLAG=1\n# BEGIN ai-share managed env\n";
      write(paths.targetCodexEnv, content);

      expect(await cleanCodexConfig(paths, { backup: false })).toEqual({ changed: [] });
      expect(readFileSync(paths.targetCodexEnv, "utf8")).toBe(content);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-clean-"));
}

function testPaths(root: string): GeneratorPaths {
  const codexHome = join(root, "codex-home");
  return {
    projectRoot: root,
    configDir: join(root, "config"),
    homeDir: join(root, "home"),
    targetCodexConfigDir: codexHome,
    targetCodexConfig: join(codexHome, "config.toml"),
    targetCodexEnv: join(codexHome, ".env"),
    targetCodexInstructions: join(codexHome, "AGENTS.md"),
    targetCodexSkillsDir: join(codexHome, "skills"),
  };
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function requireString(value: string | undefined): string {
  if (!value) throw new Error("expected string");
  return value;
}

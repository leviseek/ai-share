import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { OPENCODE_ENV_MANAGED_BEGIN, OPENCODE_ENV_MANAGED_END } from "../config/builders/env.ts";
import { cleanOpenCodeConfig } from "./clean.ts";
import {
  GENERATED_CONFIG_HEADER,
  LAUNCHER_MANAGED_MARKER,
  SKILL_MANAGED_CONTENT,
  SKILL_MANAGED_MARKER,
} from "./generation-plan.ts";
import type { GeneratorPaths } from "./paths.ts";

describe("surgical clean", () => {
  test("removes only marked OpenCode outputs and preserves user content", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const managedSkill = join(paths.targetOpenCodeSkillsDir, "managed-skill");
      const userSkill = join(paths.targetOpenCodeSkillsDir, "user-skill");
      write(paths.targetOpenCodeConfig, `${GENERATED_CONFIG_HEADER}\n{}\n`);
      write(
        paths.targetOpenCodeEnv,
        `PRIVATE_FLAG=1\n\n${OPENCODE_ENV_MANAGED_BEGIN}\nHTTP_PROXY=http://127.0.0.1:7897\n${OPENCODE_ENV_MANAGED_END}\n`,
      );
      write(join(managedSkill, "SKILL.md"), "managed\n");
      write(join(managedSkill, SKILL_MANAGED_MARKER), SKILL_MANAGED_CONTENT);
      write(join(userSkill, "SKILL.md"), "user\n");
      write(join(paths.targetOpenCodeConfigDir, "user.jsonc"), "{}\n");
      write(paths.targetAiocScript, `#!/usr/bin/env bun\n// ${LAUNCHER_MANAGED_MARKER}\n`);
      write(paths.targetAiocUnix, `#!/bin/sh\n# ${LAUNCHER_MANAGED_MARKER}\n`);
      write(paths.targetAiocCmd, `@REM user-owned aioc wrapper\r\n@REM ${LAUNCHER_MANAGED_MARKER}\r\n`);
      write(paths.targetAiocPowerShell, `# ${LAUNCHER_MANAGED_MARKER}\n`);

      const result = await cleanOpenCodeConfig(paths, { backup: false });

      expect(result.changed.length).toBeGreaterThan(0);
      expect(existsSync(paths.targetOpenCodeConfig)).toBe(false);
      expect(readFileSync(paths.targetOpenCodeEnv, "utf8")).toBe("PRIVATE_FLAG=1\n\n");
      expect(existsSync(managedSkill)).toBe(false);
      expect(readFileSync(join(userSkill, "SKILL.md"), "utf8")).toBe("user\n");
      expect(readFileSync(join(paths.targetOpenCodeConfigDir, "user.jsonc"), "utf8")).toBe("{}\n");
      expect(existsSync(paths.targetAiocScript)).toBe(false);
      expect(existsSync(paths.targetAiocUnix)).toBe(false);
      expect(readFileSync(paths.targetAiocCmd, "utf8")).toContain("user-owned");
      expect(existsSync(paths.targetAiocPowerShell)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("backs up managed config and launcher under separate safe roots", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      write(paths.targetOpenCodeConfig, `${GENERATED_CONFIG_HEADER}\n{}\n`);
      write(paths.targetAiocScript, `#!/usr/bin/env bun\n// ${LAUNCHER_MANAGED_MARKER}\n`);

      const result = await cleanOpenCodeConfig(paths, { backup: true });
      const backup = requireString(result.backupPath);
      expect(readFileSync(join(backup, "opencode", "opencode.jsonc"), "utf8")).toContain(GENERATED_CONFIG_HEADER);
      expect(readFileSync(join(backup, "bin", "aioc.ts"), "utf8")).toContain(LAUNCHER_MANAGED_MARKER);
      expect(existsSync(paths.targetOpenCodeConfig)).toBe(false);
      expect(existsSync(paths.targetAiocScript)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("preserves an incomplete env marker", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const content = `PRIVATE_FLAG=1\n${OPENCODE_ENV_MANAGED_BEGIN}\n`;
      write(paths.targetOpenCodeEnv, content);
      expect(await cleanOpenCodeConfig(paths, { backup: false })).toEqual({ changed: [] });
      expect(readFileSync(paths.targetOpenCodeEnv, "utf8")).toBe(content);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-clean-"));
}

function testPaths(root: string): GeneratorPaths {
  const home = join(root, "home");
  const configDir = join(home, ".config", "opencode");
  const binDir = join(home, ".local", "bin");
  return {
    projectRoot: root,
    configDir: join(root, "config"),
    homeDir: home,
    targetOpenCodeConfigDir: configDir,
    targetOpenCodeConfig: join(configDir, "opencode.jsonc"),
    targetOpenCodeEnv: join(configDir, ".env"),
    targetOpenCodeSkillsDir: join(configDir, "skills"),
    targetUserBinDir: binDir,
    targetAiocScript: join(binDir, "aioc.ts"),
    targetAiocUnix: join(binDir, "aioc"),
    targetAiocCmd: join(binDir, "aioc.cmd"),
    targetAiocPowerShell: join(binDir, "aioc.ps1"),
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

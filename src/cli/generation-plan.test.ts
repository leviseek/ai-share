import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import {
  buildGenerationPlan,
  executeGenerationPlan,
  GENERATED_CONFIG_HEADER,
  LAUNCHER_MANAGED_MARKER,
  SKILL_MANAGED_CONTENT,
  SKILL_MANAGED_MARKER,
} from "./generation-plan.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";

describe("generation plan", () => {
  test("creates OpenCode config, managed env and skills idempotently", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const first = await buildPlan(paths);
      expect(first.collisions).toEqual([]);
      await executeGenerationPlan(first, join(paths.targetOpenCodeConfigDir, ".staging"));

      const second = await buildPlan(paths);
      expect(second.actions).toEqual([]);
      expect(second.collisions).toEqual([]);
      expect(second.preserved).toContainEqual({
        path: paths.targetOpenCodeConfig,
        reason: "content-current",
        ownership: "managed",
      });
      expect(readFileSync(paths.targetOpenCodeConfig, "utf8")).toStartWith(GENERATED_CONFIG_HEADER);
      expect(readFileSync(paths.targetOpenCodeEnv, "utf8")).toContain("# BEGIN ai-share managed env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports an unmanaged config collision without partial writes and force adopts it", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      write(paths.targetOpenCodeConfig, "// user config\n{}\n");
      const rejected = await buildPlan(paths);
      expect(rejected.collisions).toEqual([
        { path: paths.targetOpenCodeConfig, reason: "unowned-collision", ownership: "unmanaged" },
      ]);
      const rejection = await executeGenerationPlan(rejected, join(paths.targetOpenCodeConfigDir, ".staging")).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(rejection).toBeInstanceOf(Error);
      if (!(rejection instanceof Error)) throw new Error("collision plan unexpectedly resolved");
      expect(rejection.message).toContain("未写入任何文件");
      expect(readFileSync(paths.targetOpenCodeConfig, "utf8")).toBe("// user config\n{}\n");
      expect(existsSync(paths.targetOpenCodeSkillsDir)).toBe(false);

      const adopted = await buildPlan(paths, true);
      expect(adopted.collisions).toEqual([]);
      expect(adopted.actions).toContainEqual({
        kind: "update",
        path: paths.targetOpenCodeConfig,
        content: `${GENERATED_CONFIG_HEADER}\n{}\n`,
        reason: "force-adoption",
        ownership: "unmanaged",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prunes only stale marked skills and preserves user skills", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const managed = join(paths.targetOpenCodeSkillsDir, "stale-managed");
      const user = join(paths.targetOpenCodeSkillsDir, "user-skill");
      const invalid = join(paths.targetOpenCodeSkillsDir, "invalid-marker");
      write(join(managed, SKILL_MANAGED_MARKER), SKILL_MANAGED_CONTENT);
      write(join(managed, "SKILL.md"), "stale\n");
      write(join(user, "SKILL.md"), "user\n");
      write(join(invalid, "SKILL.md"), "user\n");
      write(join(invalid, SKILL_MANAGED_MARKER), "not-ai-share\n");

      const plan = await buildPlan(paths);
      expect(plan.actions).toContainEqual({
        kind: "delete",
        path: managed,
        reason: "stale-managed-skill",
        ownership: "managed",
      });
      expect(plan.preserved).toContainEqual({
        path: user,
        reason: "unmanaged-skill-preserved",
        ownership: "unmanaged",
      });
      expect(plan.preserved).toContainEqual({
        path: invalid,
        reason: "invalid-marker-preserved",
        ownership: "invalid-marker",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("treats a blocking skill target as a collision and replaces it only with force", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const skill = NATIVE_SKILLS[0];
      if (!skill) throw new Error("native skill fixture is missing");
      const skillDir = join(paths.targetOpenCodeSkillsDir, skill.name);
      write(skillDir, "blocking file\n");

      const rejected = await buildPlan(paths);
      expect(rejected.collisions).toContainEqual({
        path: skillDir,
        reason: "blocking-path-collision",
        ownership: "unmanaged",
      });
      const adopted = await buildPlan(paths, true);
      await executeGenerationPlan(adopted, join(paths.targetOpenCodeConfigDir, ".staging"));
      expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toBe(skill.content);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("repairs a content-current Unix launcher that is not executable", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const content = "#!/bin/sh\n# Generated by ai-share OpenCode launcher.\n";
      write(paths.targetAiocUnix, content);

      const plan = await buildGenerationPlan({
        paths,
        configJsonc: `${GENERATED_CONFIG_HEADER}\n{}\n`,
        envConfig: { variables: {} },
        launcherFiles: { [paths.targetAiocUnix]: content },
        force: false,
        platform: "linux",
      });

      expect(plan.actions).toContainEqual({
        kind: "update",
        path: paths.targetAiocUnix,
        content,
        reason: "managed-mode-drift",
        ownership: "managed",
        executable: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not adopt a user launcher that only mentions the managed marker later", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const userContent = `@REM user-owned wrapper\r\n@REM ${LAUNCHER_MANAGED_MARKER}\r\n`;
      const generatedContent = `@REM ${LAUNCHER_MANAGED_MARKER}\r\n@bun aioc.ts\r\n`;
      write(paths.targetAiocCmd, userContent);

      const plan = await buildGenerationPlan({
        paths,
        configJsonc: `${GENERATED_CONFIG_HEADER}\n{}\n`,
        envConfig: { variables: {} },
        launcherFiles: { [paths.targetAiocCmd]: generatedContent },
        force: false,
      });

      expect(plan.collisions).toContainEqual({
        path: paths.targetAiocCmd,
        reason: "unowned-collision",
        ownership: "unmanaged",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-plan-"));
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

function buildPlan(paths: GeneratorPaths, force = false) {
  return buildGenerationPlan({
    paths,
    configJsonc: `${GENERATED_CONFIG_HEADER}\n{}\n`,
    envConfig: { variables: { HTTP_PROXY: "http://127.0.0.1:7897" } },
    launcherFiles: {},
    force,
  });
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

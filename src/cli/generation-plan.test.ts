import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import {
  buildGenerationPlan,
  executeGenerationPlan,
  GENERATED_CONFIG_HEADER,
  GENERATED_INSTRUCTIONS_MARKER,
  LEGACY_RUNTIME_MANIFEST,
  SKILL_MANAGED_CONTENT,
  SKILL_MANAGED_MARKER,
} from "./generation-plan.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";

describe("generation plan", () => {
  test("creates owned outputs once and is current on a second run", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const first = await buildPlan(paths);
      expect(first.collisions).toEqual([]);
      expect(first.actions.length).toBeGreaterThan(0);
      await executeGenerationPlan(first, join(paths.targetCodexConfigDir, ".staging"));

      const second = await buildPlan(paths);
      expect(second.actions).toEqual([]);
      expect(second.collisions).toEqual([]);
      expect(second.preserved).toContain(paths.targetCodexConfig);
      expect(existsSync(join(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports unowned collisions without partial writes and force adopts them", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      write(paths.targetCodexConfig, "# user config\n");
      const rejected = await buildPlan(paths);
      expect(rejected.collisions).toEqual([paths.targetCodexConfig]);
      const error = await captureError(executeGenerationPlan(rejected, join(paths.targetCodexConfigDir, ".staging")));
      expect(String(error)).toContain("未写入任何文件");
      expect(readFileSync(paths.targetCodexConfig, "utf8")).toBe("# user config\n");
      expect(existsSync(paths.targetCodexInstructions)).toBe(false);

      const adopted = await buildPlan(paths, true);
      expect(adopted.collisions).toEqual([]);
      await executeGenerationPlan(adopted, join(paths.targetCodexConfigDir, ".staging"));
      expect(readFileSync(paths.targetCodexConfig, "utf8")).toStartWith(GENERATED_CONFIG_HEADER);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prunes only stale managed skills and preserves user skills", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const managed = join(paths.targetCodexSkillsDir, "stale-managed");
      const user = join(paths.targetCodexSkillsDir, "user-skill");
      const invalidMarker = join(paths.targetCodexSkillsDir, "invalid-marker");
      write(join(managed, SKILL_MANAGED_MARKER), SKILL_MANAGED_CONTENT);
      write(join(managed, "SKILL.md"), "stale\n");
      write(join(user, "SKILL.md"), "user\n");
      write(join(invalidMarker, "SKILL.md"), "user\n");
      write(join(invalidMarker, SKILL_MANAGED_MARKER), "not-ai-share\n");

      const plan = await buildPlan(paths);
      expect(plan.actions).toContainEqual({ kind: "delete", path: managed });
      expect(plan.actions).not.toContainEqual({ kind: "delete", path: user });
      expect(plan.preserved).toContain(user);
      expect(plan.preserved).toContain(invalidMarker);
      await executeGenerationPlan(plan, join(paths.targetCodexConfigDir, ".staging"));
      expect(existsSync(managed)).toBe(false);
      expect(readFileSync(join(user, "SKILL.md"), "utf8")).toBe("user\n");
      expect(readFileSync(join(invalidMarker, "SKILL.md"), "utf8")).toBe("user\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("migrates valid legacy ownership once and preserves malformed manifests", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const skill = requireFirstNativeSkill();
      const manifest = join(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST);
      write(paths.targetCodexConfig, "# legacy config\n");
      write(join(paths.targetCodexSkillsDir, skill.name, "SKILL.md"), "legacy skill\n");
      write(
        manifest,
        `${JSON.stringify({
          version: 4,
          primary_stack: "codex",
          scope: "user",
          paths: { codex_home: paths.targetCodexConfigDir, codex_skills: paths.targetCodexSkillsDir },
          managed: { codex_config: paths.targetCodexConfig, skills: [skill.name] },
        })}\n`,
      );

      const migration = await buildPlan(paths);
      expect(migration.collisions).toEqual([]);
      expect(migration.actions).toContainEqual({ kind: "delete", path: manifest });
      await executeGenerationPlan(migration, join(paths.targetCodexConfigDir, ".staging"));
      expect(existsSync(manifest)).toBe(false);
      expect(readFileSync(join(paths.targetCodexSkillsDir, skill.name, SKILL_MANAGED_MARKER), "utf8")).toBe(
        SKILL_MANAGED_CONTENT,
      );

      write(manifest, "{ malformed\n");
      const after = await buildPlan(paths);
      expect(after.actions).not.toContainEqual({ kind: "delete", path: manifest });
      expect(readFileSync(manifest, "utf8")).toBe("{ malformed\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("treats a non-directory skill target as a collision and force replaces it safely", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const skill = requireFirstNativeSkill();
      const skillDir = join(paths.targetCodexSkillsDir, skill.name);
      write(skillDir, "blocking file\n");

      const rejected = await buildPlan(paths);
      expect(rejected.collisions).toContain(skillDir);

      const adopted = await buildPlan(paths, true);
      expect(adopted.actions).toContainEqual({ kind: "delete", path: skillDir });
      await executeGenerationPlan(adopted, join(paths.targetCodexConfigDir, ".staging"));
      expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toBe(skill.content);
      expect(readFileSync(join(skillDir, SKILL_MANAGED_MARKER), "utf8")).toBe(SKILL_MANAGED_CONTENT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

async function buildPlan(paths: GeneratorPaths, force = false) {
  return await buildGenerationPlan({
    paths,
    configToml: `${GENERATED_CONFIG_HEADER}\nmodel = "test"\n`,
    instructions: `${GENERATED_INSTRUCTIONS_MARKER}\n`,
    envConfig: { variables: {} },
    force,
  });
}

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-plan-"));
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

function requireFirstNativeSkill(): (typeof NATIVE_SKILLS)[number] {
  const skill = NATIVE_SKILLS[0];
  if (!skill) throw new Error("NATIVE_SKILLS must not be empty");
  return skill;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

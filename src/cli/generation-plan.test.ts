import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import {
  buildGenerationPlan,
  executeGenerationPlan,
  GENERATED_CONFIG_HEADER,
  GENERATED_INSTRUCTIONS_MARKER,
  AGENT_GENERATED_HEADER,
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
      expect(second.preserved).toContainEqual({
        path: paths.targetCodexConfig,
        reason: "content-current",
        ownership: "managed",
      });
      expect(existsSync(join(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST))).toBe(false);
      expect(readFileSync(join(paths.targetCodexAgentsDir, "commit.toml"), "utf8")).toStartWith(AGENT_GENERATED_HEADER);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("protects unmanaged agents and prunes only stale managed agent files", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const commitPath = join(paths.targetCodexAgentsDir, "commit.toml");
      const stalePath = join(paths.targetCodexAgentsDir, "stale.toml");
      const userPath = join(paths.targetCodexAgentsDir, "user.toml");
      write(commitPath, "# user commit agent\n");
      write(stalePath, `${AGENT_GENERATED_HEADER}\nname = "stale"\n`);
      write(userPath, 'name = "user"\n');

      const rejected = await buildPlan(paths);
      expect(rejected.collisions).toContainEqual({
        path: commitPath,
        reason: "unowned-collision",
        ownership: "unmanaged",
      });
      expect(rejected.actions).toContainEqual({
        kind: "delete",
        path: stalePath,
        reason: "stale-managed-agent",
        ownership: "managed",
      });
      expect(rejected.preserved).toContainEqual({
        path: userPath,
        reason: "unmanaged-agent-preserved",
        ownership: "unmanaged",
      });

      const adopted = await buildPlan(paths, true);
      expect(adopted.collisions).toEqual([]);
      expect(adopted.actions).toContainEqual({
        kind: "update",
        path: commitPath,
        content: `${AGENT_GENERATED_HEADER}\nname = "commit"\n`,
        reason: "force-adoption",
        ownership: "unmanaged",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("treats a non-file custom agent target as a collision and force replaces it atomically", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const commitPath = join(paths.targetCodexAgentsDir, "commit.toml");
      write(join(commitPath, "user.txt"), "user\n");

      const rejected = await buildPlan(paths);
      expect(rejected.collisions).toContainEqual({
        path: commitPath,
        reason: "blocking-path-collision",
        ownership: "unmanaged",
      });

      const adopted = await buildPlan(paths, true);
      expect(adopted.actions).toContainEqual({
        kind: "update",
        path: commitPath,
        content: `${AGENT_GENERATED_HEADER}\nname = "commit"\n`,
        reason: "force-replace-blocking-path",
        ownership: "unmanaged",
      });
      await executeGenerationPlan(adopted, join(paths.targetCodexConfigDir, ".staging"));
      expect(readFileSync(commitPath, "utf8")).toStartWith(AGENT_GENERATED_HEADER);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects unsafe custom agent ids before resolving output paths", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const error = await captureError(
        buildGenerationPlan({
          paths,
          configToml: `${GENERATED_CONFIG_HEADER}\nmodel = "test"\n`,
          instructions: `${GENERATED_INSTRUCTIONS_MARKER}\n`,
          envConfig: { variables: {} },
          agentTomls: { "../../escape": `${AGENT_GENERATED_HEADER}\n` },
          force: false,
        }),
      );
      expect(String(error)).toContain("agent id 格式不符合要求");
      expect(existsSync(join(root, "escape.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("preserves a blocking agents path when no custom agents are configured", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      write(paths.targetCodexAgentsDir, "user blocking file\n");

      const plan = await buildPlan(paths, false, {});
      expect(plan.collisions).toEqual([]);
      expect(plan.actions.some((action) => action.path === paths.targetCodexAgentsDir)).toBe(false);
      expect(plan.preserved).toContainEqual({
        path: paths.targetCodexAgentsDir,
        reason: "unmanaged-agent-preserved",
        ownership: "unmanaged",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("treats a dangling custom agent symlink as an unmanaged collision", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const commitPath = join(paths.targetCodexAgentsDir, "commit.toml");
      const missingTarget = join(root, "missing-agent-dir");
      mkdirSync(paths.targetCodexAgentsDir, { recursive: true });
      mkdirSync(missingTarget, { recursive: true });
      symlinkSync(missingTarget, commitPath, "junction");
      rmSync(missingTarget, { recursive: true, force: true });

      const plan = await buildPlan(paths);
      expect(plan.collisions).toContainEqual({
        path: commitPath,
        reason: "blocking-path-collision",
        ownership: "unmanaged",
      });
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
      expect(rejected.collisions).toEqual([
        { path: paths.targetCodexConfig, reason: "unowned-collision", ownership: "unmanaged" },
      ]);
      const error = await captureError(executeGenerationPlan(rejected, join(paths.targetCodexConfigDir, ".staging")));
      expect(String(error)).toContain("未写入任何文件");
      expect(readFileSync(paths.targetCodexConfig, "utf8")).toBe("# user config\n");
      expect(existsSync(paths.targetCodexInstructions)).toBe(false);

      const adopted = await buildPlan(paths, true);
      expect(adopted.collisions).toEqual([]);
      expect(
        adopted.actions.some(
          (action) =>
            action.kind === "update" &&
            action.path === paths.targetCodexConfig &&
            action.reason === "force-adoption" &&
            action.ownership === "unmanaged",
        ),
      ).toBe(true);
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
      expect(plan.actions).toContainEqual({
        kind: "delete",
        path: managed,
        reason: "stale-managed-skill",
        ownership: "managed",
      });
      expect(plan.actions.some((action) => action.kind === "delete" && action.path === user)).toBe(false);
      expect(plan.preserved).toContainEqual({
        path: user,
        reason: "unmanaged-skill-preserved",
        ownership: "unmanaged",
      });
      expect(plan.preserved).toContainEqual({
        path: invalidMarker,
        reason: "invalid-marker-preserved",
        ownership: "invalid-marker",
      });
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
      expect(migration.actions).toContainEqual({
        kind: "delete",
        path: manifest,
        reason: "legacy-manifest-cleanup",
        ownership: "legacy",
      });
      await executeGenerationPlan(migration, join(paths.targetCodexConfigDir, ".staging"));
      expect(existsSync(manifest)).toBe(false);
      expect(readFileSync(join(paths.targetCodexSkillsDir, skill.name, SKILL_MANAGED_MARKER), "utf8")).toBe(
        SKILL_MANAGED_CONTENT,
      );

      write(manifest, "{ malformed\n");
      const after = await buildPlan(paths);
      expect(after.actions.some((action) => action.kind === "delete" && action.path === manifest)).toBe(false);
      expect(after.preserved).toContainEqual({
        path: manifest,
        reason: "legacy-manifest-invalid-preserved",
        ownership: "unmanaged",
      });
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
      expect(rejected.collisions).toContainEqual({
        path: skillDir,
        reason: "blocking-path-collision",
        ownership: "unmanaged",
      });

      const adopted = await buildPlan(paths, true);
      expect(adopted.actions).toContainEqual({
        kind: "delete",
        path: skillDir,
        reason: "force-replace-blocking-path",
        ownership: "unmanaged",
      });
      await executeGenerationPlan(adopted, join(paths.targetCodexConfigDir, ".staging"));
      expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toBe(skill.content);
      expect(readFileSync(join(skillDir, SKILL_MANAGED_MARKER), "utf8")).toBe(SKILL_MANAGED_CONTENT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("assigns stable reasons and ownership to initial generated targets", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const plan = await buildPlan(paths);
      expect(
        plan.actions.some(
          (action) =>
            action.kind === "create" &&
            action.path === paths.targetCodexConfig &&
            action.reason === "target-missing" &&
            action.ownership === "missing",
        ),
      ).toBe(true);
      expect(
        plan.actions.some(
          (action) =>
            action.kind === "create" &&
            action.path === paths.targetCodexEnv &&
            action.reason === "target-missing" &&
            action.ownership === "missing",
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("explains managed drift, env block drift, and invalid marker adoption", async () => {
    const root = makeRoot();
    try {
      const paths = testPaths(root);
      const skill = requireFirstNativeSkill();
      write(paths.targetCodexConfig, `${GENERATED_CONFIG_HEADER}\nmodel = "old"\n`);
      write(paths.targetCodexEnv, "# user\n");
      write(join(paths.targetCodexSkillsDir, skill.name, "SKILL.md"), skill.content);
      write(join(paths.targetCodexSkillsDir, skill.name, SKILL_MANAGED_MARKER), "invalid\n");

      const rejected = await buildPlan(paths);
      expect(
        rejected.actions.some(
          (action) =>
            action.kind === "update" &&
            action.path === paths.targetCodexConfig &&
            action.reason === "managed-content-drift" &&
            action.ownership === "managed",
        ),
      ).toBe(true);
      expect(
        rejected.actions.some(
          (action) =>
            action.kind === "update" &&
            action.path === paths.targetCodexEnv &&
            action.reason === "env-managed-block-drift" &&
            action.ownership === "managed",
        ),
      ).toBe(true);
      expect(rejected.collisions).toContainEqual({
        path: join(paths.targetCodexSkillsDir, skill.name),
        reason: "unowned-collision",
        ownership: "invalid-marker",
      });

      const adopted = await buildPlan(paths, true);
      expect(
        adopted.actions.some(
          (action) =>
            action.path === join(paths.targetCodexSkillsDir, skill.name, SKILL_MANAGED_MARKER) &&
            action.reason === "force-adoption" &&
            action.ownership === "invalid-marker",
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

async function buildPlan(
  paths: GeneratorPaths,
  force = false,
  agentTomls: Readonly<Record<string, string>> = {
    commit: `${AGENT_GENERATED_HEADER}\nname = "commit"\n`,
  },
) {
  return await buildGenerationPlan({
    paths,
    configToml: `${GENERATED_CONFIG_HEADER}\nmodel = "test"\n`,
    instructions: `${GENERATED_INSTRUCTIONS_MARKER}\n`,
    envConfig: { variables: {} },
    agentTomls,
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
    targetCodexAgentsDir: join(codexHome, "agents"),
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

import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { EnvYaml } from "../types.ts";
import { CODEX_CONFIG_GENERATED_HEADER, CODEX_INSTRUCTIONS_GENERATED_HEADER } from "../config/builders/codex.ts";
import { buildCodexEnvFileWithManagedBlock } from "../config/builders/env.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";
import { pathExists, StagedFileWriter } from "./fs.ts";
import type { GeneratorPaths } from "./paths.ts";

export const GENERATED_CONFIG_HEADER: string = CODEX_CONFIG_GENERATED_HEADER;
export const GENERATED_INSTRUCTIONS_MARKER: string = CODEX_INSTRUCTIONS_GENERATED_HEADER;
export const SKILL_MANAGED_MARKER = ".ai-share-managed";
export const SKILL_MANAGED_CONTENT = "ai-share\n";
export const LEGACY_RUNTIME_MANIFEST = "ai-share.runtime.json";

export type GenerationAction =
  | { kind: "create" | "update"; path: string; content: string }
  | { kind: "delete"; path: string };

export type GenerationPlan = {
  actions: GenerationAction[];
  preserved: string[];
  collisions: string[];
};

export type LegacyOwnership = {
  configPath?: string;
  skills: Set<string>;
  manifestPath?: string;
};

export async function buildGenerationPlan(input: {
  paths: GeneratorPaths;
  configToml: string;
  instructions: string;
  envConfig: EnvYaml;
  force: boolean;
}): Promise<GenerationPlan> {
  const plan: GenerationPlan = { actions: [], preserved: [], collisions: [] };
  const legacy = await readLegacyOwnership(input.paths);

  await planOwnedFile(
    plan,
    input.paths.targetCodexConfig,
    input.configToml,
    (content) => content.startsWith(GENERATED_CONFIG_HEADER),
    legacy.configPath === resolve(input.paths.targetCodexConfig),
    input.force,
  );
  await planOwnedFile(
    plan,
    input.paths.targetCodexInstructions,
    input.instructions,
    (content) => content.startsWith(GENERATED_INSTRUCTIONS_MARKER),
    false,
    input.force,
  );

  const existingEnv = (await pathExists(input.paths.targetCodexEnv))
    ? await readFile(input.paths.targetCodexEnv, "utf8")
    : undefined;
  planWriteIfChanged(
    plan,
    input.paths.targetCodexEnv,
    buildCodexEnvFileWithManagedBlock(input.envConfig, existingEnv),
    existingEnv,
  );

  const currentSkillNames = new Set(NATIVE_SKILLS.map((skill) => skill.name));
  for (const skill of NATIVE_SKILLS) {
    const skillDir = resolve(input.paths.targetCodexSkillsDir, skill.name);
    const markerPath = resolve(skillDir, SKILL_MANAGED_MARKER);
    const skillPath = resolve(skillDir, "SKILL.md");
    const directoryExists = await pathExists(skillDir);
    const legacyOwned = legacy.skills.has(skill.name);
    if (directoryExists && !(await lstat(skillDir)).isDirectory()) {
      if (!legacyOwned && !input.force) {
        plan.collisions.push(skillDir);
        continue;
      }
      plan.actions.push({ kind: "delete", path: skillDir });
      planWriteIfChanged(plan, skillPath, skill.content, undefined);
      planWriteIfChanged(plan, markerPath, SKILL_MANAGED_CONTENT, undefined);
      continue;
    }
    const owned = (await hasManagedSkillMarker(skillDir)) || legacyOwned;
    if (directoryExists && !owned && !input.force) {
      plan.collisions.push(skillDir);
      continue;
    }
    const existingSkill = (await pathExists(skillPath)) ? await readFile(skillPath, "utf8") : undefined;
    const existingMarker = (await pathExists(markerPath)) ? await readFile(markerPath, "utf8") : undefined;
    planWriteIfChanged(plan, skillPath, skill.content, existingSkill);
    planWriteIfChanged(plan, markerPath, SKILL_MANAGED_CONTENT, existingMarker);
  }

  const staleSkills = await classifyStaleSkillDirs(input.paths, currentSkillNames, legacy.skills);
  for (const skillDir of staleSkills.deletes) {
    plan.actions.push({ kind: "delete", path: skillDir });
  }
  plan.preserved.push(...staleSkills.preserved);
  if (legacy.manifestPath) plan.actions.push({ kind: "delete", path: legacy.manifestPath });

  return plan;
}

export async function executeGenerationPlan(plan: GenerationPlan, stagingRoot: string): Promise<void> {
  if (plan.collisions.length > 0) {
    throw new Error(
      `检测到未由 ai-share 管理的目标，未写入任何文件：\n${plan.collisions.map((path) => `- ${path}`).join("\n")}\n请先备份现有文件；如确认接管，请使用 --force。`,
    );
  }
  if (plan.actions.length === 0) return;
  const writer = await StagedFileWriter.create(stagingRoot);
  try {
    for (const action of plan.actions) {
      if (action.kind === "delete") writer.delete(action.path);
      else await writer.writeText(action.path, action.content);
    }
    await writer.promote();
  } catch (error) {
    await writer.cleanup();
    throw error;
  }
}

async function planOwnedFile(
  plan: GenerationPlan,
  path: string,
  content: string,
  isOwnedContent: (content: string) => boolean,
  legacyOwned: boolean,
  force: boolean,
): Promise<void> {
  if (!(await pathExists(path))) {
    plan.actions.push({ kind: "create", path, content });
    return;
  }
  const existing = await readFile(path, "utf8");
  if (existing === content) {
    plan.preserved.push(path);
    return;
  }
  if (isOwnedContent(existing) || legacyOwned || force) {
    plan.actions.push({ kind: "update", path, content });
  } else {
    plan.collisions.push(path);
  }
}

function planWriteIfChanged(plan: GenerationPlan, path: string, content: string, existing: string | undefined): void {
  if (existing === content) plan.preserved.push(path);
  else plan.actions.push({ kind: existing === undefined ? "create" : "update", path, content });
}

export async function readLegacyOwnership(paths: GeneratorPaths): Promise<LegacyOwnership> {
  const manifestPath = resolve(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST);
  if (!(await pathExists(manifestPath))) return { skills: new Set() };
  try {
    const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      !isRecord(value) ||
      value.version !== 4 ||
      value.primary_stack !== "codex" ||
      value.scope !== "user" ||
      !isRecord(value.paths) ||
      !isRecord(value.managed)
    ) {
      return { skills: new Set() };
    }
    const configPath = typeof value.managed.codex_config === "string" ? resolve(value.managed.codex_config) : undefined;
    const codexHome = typeof value.paths.codex_home === "string" ? resolve(value.paths.codex_home) : undefined;
    const skillsPath = typeof value.paths.codex_skills === "string" ? resolve(value.paths.codex_skills) : undefined;
    const skills = value.managed.skills;
    if (
      configPath !== resolve(paths.targetCodexConfig) ||
      codexHome !== resolve(paths.targetCodexConfigDir) ||
      skillsPath !== resolve(paths.targetCodexSkillsDir) ||
      !Array.isArray(skills) ||
      !skills.every((skill): skill is string => typeof skill === "string" && isSafeSkillName(skill))
    ) {
      return { skills: new Set() };
    }
    return {
      configPath,
      skills: new Set(skills),
      manifestPath,
    };
  } catch {
    return { skills: new Set() };
  }
}

async function classifyStaleSkillDirs(
  paths: GeneratorPaths,
  currentSkillNames: ReadonlySet<string>,
  legacySkillNames: ReadonlySet<string>,
): Promise<{ deletes: string[]; preserved: string[] }> {
  if (!(await pathExists(paths.targetCodexSkillsDir))) return { deletes: [], preserved: [] };
  const deletes: string[] = [];
  const preserved: string[] = [];
  for (const entry of await readdir(paths.targetCodexSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || currentSkillNames.has(entry.name)) continue;
    const skillDir = resolve(paths.targetCodexSkillsDir, entry.name);
    if ((await hasManagedSkillMarker(skillDir)) || legacySkillNames.has(entry.name)) {
      deletes.push(skillDir);
    } else {
      preserved.push(skillDir);
    }
  }
  const byName = (left: string, right: string): number => {
    const leftName = basename(left);
    const rightName = basename(right);
    return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
  };
  return { deletes: deletes.sort(byName), preserved: preserved.sort(byName) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeSkillName(value: string): boolean {
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
}

export async function hasManagedSkillMarker(skillDir: string): Promise<boolean> {
  const markerPath = resolve(skillDir, SKILL_MANAGED_MARKER);
  if (!(await pathExists(markerPath))) return false;
  const markerStat = await lstat(markerPath);
  return (
    markerStat.isFile() &&
    !markerStat.isSymbolicLink() &&
    (await readFile(markerPath, "utf8")) === SKILL_MANAGED_CONTENT
  );
}

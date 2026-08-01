import { lstat, readFile, readdir } from "node:fs/promises";
import type { Stats } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { EnvYaml } from "../types.ts";
import { CODEX_CONFIG_GENERATED_HEADER, CODEX_INSTRUCTIONS_GENERATED_HEADER } from "../config/builders/codex.ts";
import { buildCodexEnvFileWithManagedBlock } from "../config/builders/env.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";
import { pathExists, StagedFileWriter } from "./fs.ts";
import type { GeneratorPaths } from "./paths.ts";
import { CODEX_AGENT_GENERATED_HEADER } from "../config/builders/agents.ts";

export const GENERATED_CONFIG_HEADER: string = CODEX_CONFIG_GENERATED_HEADER;
export const GENERATED_INSTRUCTIONS_MARKER: string = CODEX_INSTRUCTIONS_GENERATED_HEADER;
export const SKILL_MANAGED_MARKER = ".ai-share-managed";
export const SKILL_MANAGED_CONTENT = "ai-share\n";
export const LEGACY_RUNTIME_MANIFEST = "ai-share.runtime.json";
export const AGENT_GENERATED_HEADER: string = CODEX_AGENT_GENERATED_HEADER;

export type PlanOwnership = "missing" | "managed" | "legacy" | "unmanaged" | "invalid-marker";

export type PlanReason =
  | "target-missing"
  | "content-current"
  | "managed-content-drift"
  | "env-managed-block-drift"
  | "legacy-owned-content-drift"
  | "force-adoption"
  | "unowned-collision"
  | "blocking-path-collision"
  | "force-replace-blocking-path"
  | "stale-managed-skill"
  | "stale-managed-agent"
  | "unmanaged-skill-preserved"
  | "unmanaged-agent-preserved"
  | "invalid-marker-preserved"
  | "legacy-manifest-cleanup"
  | "legacy-manifest-invalid-preserved";

export type PlannedPath = {
  path: string;
  reason: PlanReason;
  ownership: PlanOwnership;
};

export type GenerationAction =
  | (PlannedPath & { kind: "create" | "update"; content: string })
  | (PlannedPath & { kind: "delete" });

export type GenerationPlan = {
  actions: GenerationAction[];
  preserved: PlannedPath[];
  collisions: PlannedPath[];
};

export type LegacyOwnership = {
  configPath?: string;
  skills: Set<string>;
  manifestPath?: string;
  invalidManifestPath?: string;
};

export async function buildGenerationPlan(input: {
  paths: GeneratorPaths;
  configToml: string;
  instructions: string;
  envConfig: EnvYaml;
  agentTomls: Readonly<Record<string, string>>;
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
    { changedReason: "env-managed-block-drift", ownership: "managed" },
  );

  await planAgentFiles(plan, input.paths, input.agentTomls, input.force);

  const currentSkillNames = new Set(NATIVE_SKILLS.map((skill) => skill.name));
  for (const skill of NATIVE_SKILLS) {
    const skillDir = resolve(input.paths.targetCodexSkillsDir, skill.name);
    const markerPath = resolve(skillDir, SKILL_MANAGED_MARKER);
    const skillPath = resolve(skillDir, "SKILL.md");
    const directoryExists = await pathExists(skillDir);
    const legacyOwned = legacy.skills.has(skill.name);
    if (directoryExists && !(await lstat(skillDir)).isDirectory()) {
      if (!legacyOwned && !input.force) {
        plan.collisions.push(plannedPath(skillDir, "blocking-path-collision", "unmanaged"));
        continue;
      }
      const ownership = legacyOwned ? "legacy" : "unmanaged";
      plan.actions.push({
        kind: "delete",
        path: skillDir,
        reason: legacyOwned ? "legacy-owned-content-drift" : "force-replace-blocking-path",
        ownership,
      });
      const context = skillWriteContext(ownership, input.force);
      planWriteIfChanged(plan, skillPath, skill.content, undefined, context);
      planWriteIfChanged(plan, markerPath, SKILL_MANAGED_CONTENT, undefined, context);
      continue;
    }
    const markerOwnership = directoryExists ? await skillMarkerOwnership(skillDir) : "unmanaged";
    const ownership: PlanOwnership = legacyOwned ? "legacy" : markerOwnership;
    const owned = ownership === "managed" || ownership === "legacy";
    if (directoryExists && !owned && !input.force) {
      plan.collisions.push(plannedPath(skillDir, "unowned-collision", ownership));
      continue;
    }
    const existingSkill = (await pathExists(skillPath)) ? await readFile(skillPath, "utf8") : undefined;
    const existingMarker = (await pathExists(markerPath)) ? await readFile(markerPath, "utf8") : undefined;
    const context = directoryExists
      ? skillWriteContext(ownership, input.force)
      : { changedReason: "managed-content-drift" as const, ownership: "missing" as const };
    planWriteIfChanged(plan, skillPath, skill.content, existingSkill, context);
    planWriteIfChanged(plan, markerPath, SKILL_MANAGED_CONTENT, existingMarker, context);
  }

  const staleSkills = await classifyStaleSkillDirs(input.paths, currentSkillNames, legacy.skills);
  for (const skill of staleSkills.deletes) {
    plan.actions.push({ kind: "delete", ...skill });
  }
  plan.preserved.push(...staleSkills.preserved);
  if (legacy.manifestPath) {
    plan.actions.push({
      kind: "delete",
      path: legacy.manifestPath,
      reason: "legacy-manifest-cleanup",
      ownership: "legacy",
    });
  }
  if (legacy.invalidManifestPath) {
    plan.preserved.push(plannedPath(legacy.invalidManifestPath, "legacy-manifest-invalid-preserved", "unmanaged"));
  }

  return plan;
}

async function planAgentFiles(
  plan: GenerationPlan,
  paths: GeneratorPaths,
  agentTomls: Readonly<Record<string, string>>,
  force: boolean,
): Promise<void> {
  const desiredAgents = Object.entries(agentTomls).map(([agentId, content]) => ({
    agentId,
    content,
    path: resolveAgentPath(paths.targetCodexAgentsDir, agentId),
  }));
  const desiredFileNames = new Set(desiredAgents.map((agent) => `${agent.agentId}.toml`));
  const directoryStat = await lstatIfExists(paths.targetCodexAgentsDir);
  const directoryExists = directoryStat !== undefined;
  if (directoryStat && (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())) {
    if (desiredAgents.length === 0) {
      plan.preserved.push(plannedPath(paths.targetCodexAgentsDir, "unmanaged-agent-preserved", "unmanaged"));
      return;
    }
    if (!force) {
      plan.collisions.push(plannedPath(paths.targetCodexAgentsDir, "blocking-path-collision", "unmanaged"));
      return;
    }
    plan.actions.push({
      kind: "delete",
      path: paths.targetCodexAgentsDir,
      reason: "force-replace-blocking-path",
      ownership: "unmanaged",
    });
    for (const agent of desiredAgents) {
      plan.actions.push({
        kind: "create",
        path: agent.path,
        content: agent.content,
        reason: "force-adoption",
        ownership: "unmanaged",
      });
    }
    return;
  }

  for (const agent of desiredAgents) {
    await planAgentFile(plan, agent.path, agent.content, force);
  }

  if (!directoryExists) return;
  const existingEntries = await readdir(paths.targetCodexAgentsDir, { withFileTypes: true });
  existingEntries.sort((left, right) => compareText(left.name, right.name));
  for (const entry of existingEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".toml") || desiredFileNames.has(entry.name)) continue;
    const path = resolve(paths.targetCodexAgentsDir, entry.name);
    const content = await readFile(path, "utf8");
    if (content.startsWith(AGENT_GENERATED_HEADER)) {
      plan.actions.push({ kind: "delete", path, reason: "stale-managed-agent", ownership: "managed" });
    } else {
      plan.preserved.push(plannedPath(path, "unmanaged-agent-preserved", "unmanaged"));
    }
  }
}

function resolveAgentPath(agentsDir: string, agentId: string): string {
  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) throw new Error(`agent id 格式不符合要求：${agentId}`);
  const path = resolve(agentsDir, `${agentId}.toml`);
  const rel = relative(resolve(agentsDir), path);
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/)[0] === "..") {
    throw new Error(`agent 输出路径超出 CODEX_HOME：${agentId}`);
  }
  return path;
}

async function lstatIfExists(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function planAgentFile(plan: GenerationPlan, path: string, content: string, force: boolean): Promise<void> {
  const pathStat = await lstatIfExists(path);
  if (!pathStat) {
    plan.actions.push({ kind: "create", path, content, reason: "target-missing", ownership: "missing" });
    return;
  }
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    if (!force) {
      plan.collisions.push(plannedPath(path, "blocking-path-collision", "unmanaged"));
      return;
    }
    plan.actions.push({
      kind: "update",
      path,
      content,
      reason: "force-replace-blocking-path",
      ownership: "unmanaged",
    });
    return;
  }
  const existing = await readFile(path, "utf8");
  if (existing === content) {
    plan.preserved.push(plannedPath(path, "content-current", "managed"));
  } else if (existing.startsWith(AGENT_GENERATED_HEADER)) {
    plan.actions.push({ kind: "update", path, content, reason: "managed-content-drift", ownership: "managed" });
  } else if (force) {
    plan.actions.push({ kind: "update", path, content, reason: "force-adoption", ownership: "unmanaged" });
  } else {
    plan.collisions.push(plannedPath(path, "unowned-collision", "unmanaged"));
  }
}

export async function executeGenerationPlan(plan: GenerationPlan, stagingRoot: string): Promise<void> {
  if (plan.collisions.length > 0) {
    throw new Error(
      `检测到未由 ai-share 管理的目标，未写入任何文件：\n${plan.collisions.map((entry) => `- ${entry.path}`).join("\n")}\n请先备份现有文件；如确认接管，请使用 --force。`,
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
    plan.actions.push({ kind: "create", path, content, reason: "target-missing", ownership: "missing" });
    return;
  }
  const existing = await readFile(path, "utf8");
  if (existing === content) {
    plan.preserved.push(plannedPath(path, "content-current", "managed"));
    return;
  }
  if (isOwnedContent(existing)) {
    plan.actions.push({ kind: "update", path, content, reason: "managed-content-drift", ownership: "managed" });
    return;
  }
  if (legacyOwned) {
    plan.actions.push({
      kind: "update",
      path,
      content,
      reason: "legacy-owned-content-drift",
      ownership: "legacy",
    });
    return;
  }
  if (force) {
    plan.actions.push({ kind: "update", path, content, reason: "force-adoption", ownership: "unmanaged" });
    return;
  }
  plan.collisions.push(plannedPath(path, "unowned-collision", "unmanaged"));
}

function planWriteIfChanged(
  plan: GenerationPlan,
  path: string,
  content: string,
  existing: string | undefined,
  context: {
    changedReason: PlanReason;
    ownership: PlanOwnership;
    missingReason?: PlanReason;
    missingOwnership?: PlanOwnership;
  },
): void {
  if (existing === content) {
    plan.preserved.push(plannedPath(path, "content-current", context.ownership));
    return;
  }
  if (existing === undefined) {
    plan.actions.push({
      kind: "create",
      path,
      content,
      reason: context.missingReason ?? "target-missing",
      ownership: context.missingOwnership ?? "missing",
    });
    return;
  }
  plan.actions.push({
    kind: "update",
    path,
    content,
    reason: context.changedReason,
    ownership: context.ownership,
  });
}

export async function readLegacyOwnership(paths: GeneratorPaths): Promise<LegacyOwnership> {
  const manifestPath = resolve(paths.targetCodexConfigDir, LEGACY_RUNTIME_MANIFEST);
  if (!(await pathExists(manifestPath))) return { skills: new Set() };
  const invalidManifest = (): LegacyOwnership => ({ skills: new Set(), invalidManifestPath: manifestPath });
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
      return invalidManifest();
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
      return invalidManifest();
    }
    return {
      configPath,
      skills: new Set(skills),
      manifestPath,
    };
  } catch {
    return invalidManifest();
  }
}

async function classifyStaleSkillDirs(
  paths: GeneratorPaths,
  currentSkillNames: ReadonlySet<string>,
  legacySkillNames: ReadonlySet<string>,
): Promise<{ deletes: PlannedPath[]; preserved: PlannedPath[] }> {
  if (!(await pathExists(paths.targetCodexSkillsDir))) return { deletes: [], preserved: [] };
  const deletes: PlannedPath[] = [];
  const preserved: PlannedPath[] = [];
  for (const entry of await readdir(paths.targetCodexSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || currentSkillNames.has(entry.name)) continue;
    const skillDir = resolve(paths.targetCodexSkillsDir, entry.name);
    const ownership = legacySkillNames.has(entry.name) ? "legacy" : await skillMarkerOwnership(skillDir);
    if (ownership === "managed" || ownership === "legacy") {
      deletes.push(plannedPath(skillDir, "stale-managed-skill", ownership));
    } else if (ownership === "invalid-marker") {
      preserved.push(plannedPath(skillDir, "invalid-marker-preserved", ownership));
    } else {
      preserved.push(plannedPath(skillDir, "unmanaged-skill-preserved", ownership));
    }
  }
  const byName = (left: PlannedPath, right: PlannedPath): number => {
    const leftName = basename(left.path);
    const rightName = basename(right.path);
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
  return (await skillMarkerOwnership(skillDir)) === "managed";
}

async function skillMarkerOwnership(skillDir: string): Promise<"managed" | "unmanaged" | "invalid-marker"> {
  const markerPath = resolve(skillDir, SKILL_MANAGED_MARKER);
  if (!(await pathExists(markerPath))) return "unmanaged";
  const markerStat = await lstat(markerPath);
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) return "invalid-marker";
  return (await readFile(markerPath, "utf8")) === SKILL_MANAGED_CONTENT ? "managed" : "invalid-marker";
}

function skillWriteContext(
  ownership: PlanOwnership,
  force: boolean,
): {
  changedReason: PlanReason;
  ownership: PlanOwnership;
  missingReason?: PlanReason;
  missingOwnership?: PlanOwnership;
} {
  if (force && (ownership === "unmanaged" || ownership === "invalid-marker")) {
    return {
      changedReason: "force-adoption",
      ownership,
      missingReason: "force-adoption",
      missingOwnership: ownership,
    };
  }
  if (ownership === "legacy") {
    return {
      changedReason: "legacy-owned-content-drift",
      ownership,
      missingReason: "legacy-owned-content-drift",
      missingOwnership: ownership,
    };
  }
  return { changedReason: "managed-content-drift", ownership };
}

function plannedPath(path: string, reason: PlanReason, ownership: PlanOwnership): PlannedPath {
  return { path, reason, ownership };
}

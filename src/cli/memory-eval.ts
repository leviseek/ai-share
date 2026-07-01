#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { nativeSkillNames } from "./native-skills.ts";
import { buildInstructionsPaths } from "../config/builders/instructions.ts";
import { buildRuntimeManifest } from "../config/builders/runtime-manifest.ts";
import { searchMemory } from "../memory/retrieval.ts";
import { parseYamlObject } from "../yaml.ts";

export type MemoryEvalStatus = "pass" | "fail";

export type MemoryEvalResult = {
  task: string;
  status: MemoryEvalStatus;
  reason: string;
};

type MemoryEvalConfig = {
  taskRetrievalQuery: string;
  taskRetrievalExpectedPath: string;
  profileOrderProfile: string;
  profileOrderExpectedAfter: string;
  profileOrderExpectedPath: string;
};

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  const results = evaluateMemoryRuntime(projectRoot);
  printMemoryEvalResults(results);
  process.exit(results.some((result) => result.status === "fail") ? 1 : 0);
}

export function evaluateMemoryRuntime(root: string = projectRoot): MemoryEvalResult[] {
  const config = loadMemoryEvalConfig(root);
  return [
    evaluateBaseInstructions(root),
    evaluateTaskRetrieval(root, config),
    evaluateProfileOrder(root, config),
    evaluateManagedSkills(root),
  ];
}

function evaluateBaseInstructions(root: string): MemoryEvalResult {
  const paths = normalizePaths(root, buildInstructionsPaths(root));
  const required = [
    "AI_GUIDELINES.md",
    "memory/policies/ai-execution-contract.md",
    "memory/policies/memory-lifecycle.md",
  ];
  const missing = required.filter((path) => !paths.includes(path));

  return missing.length === 0
    ? pass("base_instructions", `injected ${required.join(", ")}`)
    : fail("base_instructions", `missing ${missing.join(", ")}`);
}

function evaluateTaskRetrieval(root: string, config: MemoryEvalConfig): MemoryEvalResult {
  const results = searchMemory(config.taskRetrievalQuery, root);
  const paths = results.map((result) => result.path);
  const found = paths.includes(config.taskRetrievalExpectedPath);

  return found
    ? pass("task_retrieval", `query matched ${config.taskRetrievalExpectedPath}`)
    : fail(
        "task_retrieval",
        `query did not match ${config.taskRetrievalExpectedPath}; got ${paths.join(", ") || "none"}`,
      );
}

function evaluateProfileOrder(root: string, config: MemoryEvalConfig): MemoryEvalResult {
  const paths = normalizePaths(root, buildInstructionsPaths(root, config.profileOrderProfile));
  const expectedIndex = paths.indexOf(config.profileOrderExpectedPath);
  const afterIndex = paths.indexOf(config.profileOrderExpectedAfter);

  if (expectedIndex < 0) return fail("profile_order", `missing ${config.profileOrderExpectedPath}`);
  if (afterIndex < 0) return fail("profile_order", `missing ${config.profileOrderExpectedAfter}`);
  if (expectedIndex <= afterIndex) {
    return fail(
      "profile_order",
      `${config.profileOrderExpectedPath} must appear after ${config.profileOrderExpectedAfter}`,
    );
  }

  return pass("profile_order", `${config.profileOrderExpectedPath} appears after ${config.profileOrderExpectedAfter}`);
}

function evaluateManagedSkills(root: string): MemoryEvalResult {
  const skills = nativeSkillNames();
  const sourceSkills = listSkillSourceNames(root);
  const unregistered = sourceSkills.filter((skill) => !skills.includes(skill));
  const missingSource = skills.filter((skill) => !sourceSkills.includes(skill));

  if (unregistered.length > 0 || missingSource.length > 0) {
    return fail(
      "managed_skills",
      `native skill registry/source mismatch; unregistered ${unregistered.join(", ") || "none"}; missing source ${
        missingSource.join(", ") || "none"
      }`,
    );
  }

  const manifest = buildRuntimeManifest({
    paths: evalPaths(root),
    defaultProfileId: "balanced",
    profileIds: ["balanced"],
    mcpServerIds: [],
    codexEnvVarNames: [],
    skillIds: skills,
    instructionFilesByProfile: { balanced: buildInstructionsPaths(root, "balanced") },
    profilesConfig: { balanced: {} },
  });
  const managedSkills = manifest.managed.skills;
  const missing = skills.filter((skill) => !managedSkills.includes(skill));
  const unexpected = managedSkills.filter((skill) => !skills.includes(skill));

  return missing.length === 0 && unexpected.length === 0
    ? pass("managed_skills", `runtime manifest matches ${sourceSkills.length} source-managed skills`)
    : fail(
        "managed_skills",
        `runtime manifest mismatch; missing ${missing.join(", ") || "none"}; unexpected ${
          unexpected.join(", ") || "none"
        }`,
      );
}

function loadMemoryEvalConfig(root: string): MemoryEvalConfig {
  const configPath = resolve(root, "config", "memory-eval.yaml");
  const rawConfig = existsSync(configPath) ? parseYamlObject(readFileSync(configPath, "utf8")) : {};
  const tasks = isRecord(rawConfig.tasks) ? rawConfig.tasks : {};
  const taskRetrieval = isRecord(tasks.task_retrieval) ? tasks.task_retrieval : {};
  const profileOrder = isRecord(tasks.profile_order) ? tasks.profile_order : {};

  return {
    taskRetrievalQuery: stringField(
      taskRetrieval.query,
      "memory governance lifecycle stable distilled candidate review",
    ),
    taskRetrievalExpectedPath: stringField(taskRetrieval.expected_path, "memory/policies/memory-lifecycle.md"),
    profileOrderProfile: stringField(profileOrder.profile, "coding"),
    profileOrderExpectedAfter: stringField(profileOrder.expected_after, "memory/stack/models.md"),
    profileOrderExpectedPath: stringField(profileOrder.expected_path, "memory/profiles/coding.yaml"),
  };
}

function evalPaths(root: string): GeneratorPaths {
  const codexHome = resolve(root, ".memory-eval", "codex-home");
  return {
    projectRoot: root,
    configDir: resolve(root, "config"),
    binDir: resolve(root, "bin"),
    aiWorkspaceDir: resolve(root, ".memory-eval", "ai-workspace"),
    workspaceAiShareDir: resolve(root, ".memory-eval", "ai-workspace", "ai-share"),
    homeDir: resolve(root, ".memory-eval", "home"),
    targetCodexConfigDir: codexHome,
    targetCodexConfig: resolve(codexHome, "config.toml"),
    targetCodexEnv: resolve(codexHome, ".env"),
    targetCodexInstructions: resolve(codexHome, "AGENTS.md"),
    targetRuntimeManifest: resolve(codexHome, "ai-share.runtime.json"),
    targetBinDir: resolve(root, ".memory-eval", "bin"),
    targetCodexSkillsDir: resolve(codexHome, "skills"),
  };
}

function normalizePaths(root: string, paths: readonly string[]): string[] {
  return paths.map((path) => relative(root, path).split(sep).join("/"));
}

function listSkillSourceNames(root: string): string[] {
  const skillsRoot = resolve(root, "skills");
  if (!existsSync(skillsRoot)) return [];

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function pass(task: string, reason: string): MemoryEvalResult {
  return { task, status: "pass", reason };
}

function fail(task: string, reason: string): MemoryEvalResult {
  return { task, status: "fail", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function printMemoryEvalResults(results: readonly MemoryEvalResult[]): void {
  for (const result of results) {
    console.log(`${result.status.toUpperCase()} ${result.task}: ${result.reason}`);
  }
}

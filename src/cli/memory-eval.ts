#!/usr/bin/env bun

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { buildInstructionsPaths } from "../config/builders/instructions.ts";
import { searchMemory } from "../memory/retrieval.ts";
import { buildGenerationPlan, GENERATED_CONFIG_HEADER, SKILL_MANAGED_MARKER } from "./generation-plan.ts";
import { nativeSkillNames } from "./native-skills.ts";
import type { GeneratorPaths } from "./paths.ts";

export type MemoryEvalStatus = "pass" | "fail";
export type MemoryEvalResult = { task: string; status: MemoryEvalStatus; reason: string };

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  const results = await evaluateMemoryRuntime(projectRoot);
  for (const result of results) console.log(`${result.status.toUpperCase()} ${result.task}: ${result.reason}`);
  process.exitCode = results.some((result) => result.status === "fail") ? 1 : 0;
}

export async function evaluateMemoryRuntime(root: string = projectRoot): Promise<MemoryEvalResult[]> {
  return [
    evaluateBaseInstructions(root),
    evaluateTaskRetrieval(root),
    evaluateRetrievalPolicy(),
    await evaluateManagedSkills(root),
  ];
}

function evaluateBaseInstructions(root: string): MemoryEvalResult {
  const paths = normalizePaths(root, buildInstructionsPaths(root, ""));
  const required = [
    "AI_GUIDELINES.md",
    "memory/policies/ai-execution-contract.md",
    "memory/policies/memory-lifecycle.md",
    "memory/stable/user.yaml",
    "memory/stable/workflows.yaml",
    "memory/stable/devices.yaml",
  ];
  const unique = new Set(paths);
  if (paths.length !== unique.size) return fail("base_instructions", "instruction paths contain duplicates");
  if (paths.length !== required.length || paths.some((path, index) => path !== required[index])) {
    return fail("base_instructions", `expected ${required.join(", ")}; got ${paths.join(",")}`);
  }
  const missing = required.filter((path) => !existsSync(resolve(root, path)));
  if (missing.length > 0) return fail("base_instructions", `missing files: ${missing.join(",")}`);
  return pass("base_instructions", `injected ${required.length} unique base files`);
}

function evaluateTaskRetrieval(root: string): MemoryEvalResult {
  const expected = "memory/architecture/ai-desktop.md";
  const paths = searchMemory("AI Desktop Context Compiler 按需检索", root).map((result) => result.path);
  return paths.includes(expected)
    ? pass("task_retrieval", `query matched ${expected}`)
    : fail("task_retrieval", `query did not match ${expected}; got ${paths.join(", ") || "none"}`);
}

function evaluateRetrievalPolicy(): MemoryEvalResult {
  const root = mkdtempSync(join(tmpdir(), "ai-share-memory-eval-"));
  try {
    writeFixture(
      root,
      "memory/distilled/confirmed.md",
      "---\nconfirmed_by_user: true\n---\n# Confirmed\nretrieval-policy-sentinel\n",
    );
    writeFixture(
      root,
      "memory/distilled/unconfirmed.md",
      "---\nconfirmed_by_user: false\n---\n# Draft\nretrieval-policy-sentinel\n",
    );
    writeFixture(
      root,
      "memory/distilled/TEMPLATE.md",
      "---\nconfirmed_by_user: true\n---\n# Template\nretrieval-policy-sentinel\n",
    );
    writeFixture(root, "memory/inferred/candidate.md", "# Candidate\nretrieval-policy-sentinel\n");
    const paths = searchMemory("retrieval-policy-sentinel", root).map((result) => result.path);
    return paths.length === 1 && paths[0] === "memory/distilled/confirmed.md"
      ? pass("retrieval_policy", "confirmed distilled included; template, inferred and unconfirmed excluded")
      : fail("retrieval_policy", `unexpected paths: ${paths.join(",") || "none"}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function evaluateManagedSkills(root: string): Promise<MemoryEvalResult> {
  const registered = nativeSkillNames();
  const source = listSkillSourceNames(root);
  if (registered.length !== source.length || !registered.every((skill, index) => skill === source[index])) {
    return fail("skill_install_plan", `registry=${registered.join(",")} source=${source.join(",")}`);
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "ai-share-skill-plan-"));
  try {
    const paths = temporaryPaths(tempRoot, root);
    const plan = await buildGenerationPlan({
      paths,
      configJsonc: `${GENERATED_CONFIG_HEADER}\n{}\n`,
      envConfig: { variables: {} },
      launcherFiles: {},
      force: false,
    });
    const writes = new Set(
      plan.actions
        .filter((action) => action.kind === "create" || action.kind === "update")
        .map((action) => relative(paths.targetOpenCodeConfigDir, action.path).split(sep).join("/")),
    );
    const complete = registered.every(
      (skill) => writes.has(`skills/${skill}/SKILL.md`) && writes.has(`skills/${skill}/${SKILL_MANAGED_MARKER}`),
    );
    return complete
      ? pass("skill_install_plan", `planned ${registered.length} marked skills without a runtime manifest`)
      : fail("skill_install_plan", `incomplete skill plan: ${[...writes].join(",")}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function listSkillSourceNames(root: string): string[] {
  const skillsRoot = resolve(root, "skills");
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function normalizePaths(root: string, paths: readonly string[]): string[] {
  return paths.map((path) => relative(root, path).split(sep).join("/"));
}

function writeFixture(root: string, path: string, content: string): void {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function temporaryPaths(tempRoot: string, projectRoot: string): GeneratorPaths {
  const openCodeDir = resolve(tempRoot, "opencode-home");
  const binDir = resolve(tempRoot, "home", ".local", "bin");
  return {
    projectRoot,
    configDir: resolve(projectRoot, "config"),
    homeDir: resolve(tempRoot, "home"),
    targetOpenCodeConfigDir: openCodeDir,
    targetOpenCodeConfig: resolve(openCodeDir, "opencode.jsonc"),
    targetOpenCodeEnv: resolve(openCodeDir, ".env"),
    targetOpenCodeSkillsDir: resolve(openCodeDir, "skills"),
    targetGlobalSkillsDir: resolve(tempRoot, "home", ".agents", "skills"),
    targetUserBinDir: binDir,
    targetAiocScript: resolve(binDir, "aioc.ts"),
    targetAiocUnix: resolve(binDir, "aioc"),
    targetAiocCmd: resolve(binDir, "aioc.cmd"),
    targetAiocPowerShell: resolve(binDir, "aioc.ps1"),
  };
}

function pass(task: string, reason: string): MemoryEvalResult {
  return { task, status: "pass", reason };
}

function fail(task: string, reason: string): MemoryEvalResult {
  return { task, status: "fail", reason };
}

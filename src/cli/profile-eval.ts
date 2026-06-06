#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModelsYaml, ProfilesYaml } from "../types.ts";
import { parseYamlObject } from "../yaml.ts";

export type ProfileEvalOptions = {
  task: string;
  profiles: string[];
  execute: boolean;
  output?: string;
  manualSuccess?: "success" | "failed" | "unknown";
  manualReworkMinutes?: number;
  notes?: string;
};

export type ProfileEvaluationReport = {
  protocol: "ai-share/profile-eval/v1";
  task: string;
  execute: boolean;
  created_at: string;
  cost_basis: "config.models.cost per 1K tokens";
  runs: ProfileEvaluationRun[];
};

export type ProfileEvaluationRun = {
  profile: string;
  models: {
    primary: string;
    reasoning: string;
    fast: string;
  };
  estimate: {
    input_tokens: number;
    primary_input_cost_usd: number;
    primary_max_output_cost_usd: number;
  };
  result: {
    status: "planned" | "success" | "failed";
    exit_code: number | null;
    elapsed_ms: number | null;
    manual_success: "success" | "failed" | "unknown";
    manual_rework_minutes: number | null;
    notes: string;
  };
};

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  main(Bun.argv.slice(2));
}

export function parseProfileEvalArgs(
  args: readonly string[],
  availableProfiles: readonly string[],
): ProfileEvalOptions {
  const task = parseOption(args, "--task") ?? args.find((arg) => !arg.startsWith("--"));
  if (!task) throw new Error(profileEvalUsage(availableProfiles));

  const profileValue = parseOption(args, "--profiles") ?? parseOption(args, "--profile");
  const profiles = profileValue
    ? profileValue
        .split(",")
        .map((profile) => profile.trim())
        .filter(Boolean)
    : [...availableProfiles];
  if (profiles.length === 0) throw new Error("至少需要一个 profile。");

  const manualReworkValue = parseOption(args, "--manual-rework-minutes");
  const manualSuccess = parseManualSuccess(parseOption(args, "--manual-success"));
  const output = parseOption(args, "--output");
  const notes = parseOption(args, "--notes");

  return {
    task,
    profiles,
    execute: args.includes("--execute"),
    ...(output ? { output } : {}),
    ...(manualSuccess ? { manualSuccess } : {}),
    ...(manualReworkValue ? { manualReworkMinutes: parseNonNegativeNumber(manualReworkValue) } : {}),
    ...(notes ? { notes } : {}),
  };
}

export function buildEvaluationReport(
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  options: ProfileEvalOptions,
  createdAt: Date = new Date(),
): ProfileEvaluationReport {
  return {
    protocol: "ai-share/profile-eval/v1",
    task: options.task,
    execute: options.execute,
    created_at: createdAt.toISOString(),
    cost_basis: "config.models.cost per 1K tokens",
    runs: options.profiles.map((profileId) => buildPlannedRun(profileId, profilesConfig, modelsConfig, options)),
  };
}

function main(args: readonly string[]): void {
  const profilesConfig = loadYaml("profiles.yaml") as ProfilesYaml;
  const modelsConfig = loadYaml("models.yaml") as ModelsYaml;
  const options = parseProfileEvalArgs(args, Object.keys(profilesConfig));
  const report = buildEvaluationReport(profilesConfig, modelsConfig, options);

  if (options.execute) {
    for (const run of report.runs) {
      executeRun(run, report.task);
    }
  }

  const outputPath = options.output ?? defaultOutputPath();
  writeReport(outputPath, report);
  console.log(`profile evaluation report：${outputPath}`);
}

function buildPlannedRun(
  profileId: string,
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  options: ProfileEvalOptions,
): ProfileEvaluationRun {
  const profile = profilesConfig[profileId];
  if (!profile?.models?.primary || !profile.models.reasoning || !profile.models.fast) {
    throw new Error(`未知或不完整 profile：${profileId}`);
  }

  const primaryModel = requireModel(modelsConfig, profile.models.primary);
  const inputTokens = estimateTokens(options.task);
  return {
    profile: profileId,
    models: {
      primary: profile.models.primary,
      reasoning: profile.models.reasoning,
      fast: profile.models.fast,
    },
    estimate: {
      input_tokens: inputTokens,
      primary_input_cost_usd: roundUsd(
        (inputTokens * requireNumber(primaryModel.cost?.input, `${profileId}.cost.input`)) / 1000,
      ),
      primary_max_output_cost_usd: roundUsd(
        (requireNumber(primaryModel.limits?.max_output, `${profileId}.limits.max_output`) *
          requireNumber(primaryModel.cost?.output, `${profileId}.cost.output`)) /
          1000,
      ),
    },
    result: {
      status: "planned",
      exit_code: null,
      elapsed_ms: null,
      manual_success: options.manualSuccess ?? "unknown",
      manual_rework_minutes: options.manualReworkMinutes ?? null,
      notes: options.notes ?? "",
    },
  };
}

function executeRun(run: ProfileEvaluationRun, task: string): void {
  const startedAt = performance.now();
  const result = spawnSync("aiomx", [run.profile, "exec", task], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  run.result.elapsed_ms = elapsedMs;
  run.result.exit_code = result.status ?? 1;
  run.result.status = result.status === 0 ? "success" : "failed";
}

function parseOption(args: readonly string[], name: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === name) return args[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseManualSuccess(value: string | undefined): "success" | "failed" | "unknown" | undefined {
  if (value === undefined) return undefined;
  if (value === "success" || value === "failed" || value === "unknown") return value;
  throw new Error("--manual-success 必须是 success、failed 或 unknown");
}

function parseNonNegativeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`必须是非负数字：${value}`);
  return parsed;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function requireModel(modelsConfig: ModelsYaml, modelId: string): ModelsYaml[string] {
  const model = modelsConfig[modelId];
  if (!model) throw new Error(`模型未定义：${modelId}`);
  return model;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`缺少数字字段：${label}`);
  return value;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function loadYaml(fileName: string): object {
  return parseYamlObject(readFileSync(resolve(projectRoot, "config", fileName), "utf8"));
}

function defaultOutputPath(): string {
  return resolve(
    projectRoot,
    ".sisyphus",
    "evidence",
    "profile-eval",
    `${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
}

function writeReport(outputPath: string, report: ProfileEvaluationReport): void {
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function profileEvalUsage(availableProfiles: readonly string[]): string {
  return [
    "用法：bun run profile:eval -- --task <task> [--profiles coding,max] [--output <path>] [--execute]",
    `可用 profile：${availableProfiles.join(", ")}`,
    "默认只写 planned report；传 --execute 才会实际运行 aiomx 并产生模型调用。",
  ].join("\n");
}

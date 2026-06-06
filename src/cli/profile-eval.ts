#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModelsYaml, ProfileEvalYaml, ProfilesYaml } from "../types.ts";
import { loadConfigYamlSync } from "../config/local-overlay.ts";
import { parseYamlObject } from "../yaml.ts";

export type ProfileEvalOptions = {
  task?: string;
  taskIds: string[];
  profiles: string[];
  execute: boolean;
  repeat: number;
  output?: string;
  failureTag?: string;
  manualSuccess?: "success" | "failed" | "unknown";
  manualReworkMinutes?: number;
  manualScore?: number;
  notes?: string;
};

export type ProfileEvaluationTask = {
  id: string;
  title: string;
  category: string;
  weight: number;
  prompt: string;
  success_criteria: string[];
};

export type ProfileEvaluationScoring = {
  pass_score?: number;
  dimensions?: Record<string, { weight?: number; description?: string }>;
};

export type ProfileEvaluationReport = {
  protocol: "ai-share/profile-eval/v2";
  task_set: string;
  execute: boolean;
  created_at: string;
  cost_basis: "config.models.cost per 1K tokens";
  scoring: ProfileEvaluationScoring;
  tasks: ProfileEvaluationTask[];
  runs: ProfileEvaluationRun[];
  summary: ProfileEvaluationSummary[];
  markdown_output_path?: string;
};

export type ProfileEvaluationRun = {
  profile: string;
  task_id: string;
  repeat: number;
  task_weight: number;
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
    actual_elapsed_ms: number | null;
    stdout_path: string | null;
    stderr_path: string | null;
    failure_tag: string | null;
    manual_success: "success" | "failed" | "unknown";
    manual_rework_minutes: number | null;
    manual_score: number | null;
    score: number | null;
    score_basis: "manual_score" | "manual_success" | "unscored";
    notes: string;
  };
};

export type ProfileEvaluationSummary = {
  profile: string;
  runs: number;
  scored_runs: number;
  weighted_score: number | null;
  estimated_primary_cost_usd: number;
};

const projectRoot = resolve(import.meta.dirname, "..", "..");

if (import.meta.main) {
  main(Bun.argv.slice(2));
}

export function parseProfileEvalArgs(
  args: readonly string[],
  availableProfiles: readonly string[],
  availableTaskIds: readonly string[] = [],
): ProfileEvalOptions {
  const task = parseOption(args, "--task") ?? positionalTask(args);
  const taskValue = parseOption(args, "--tasks") ?? parseOption(args, "--task-id");
  const taskIds = taskValue
    ? taskValue
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  if (task && taskIds.length > 0) throw new Error("--task 不能和 --tasks/--task-id 同时使用。");
  if (!task && taskIds.length === 0) taskIds.push(...availableTaskIds);
  if (!task && taskIds.length === 0) throw new Error(profileEvalUsage(availableProfiles, availableTaskIds));

  const unknownTasks = taskIds.filter((taskId) => !availableTaskIds.includes(taskId));
  if (unknownTasks.length > 0) throw new Error(`未知 profile evaluation task：${unknownTasks.join("、")}`);

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
  const manualScoreValue = parseOption(args, "--manual-score");
  const repeat = parsePositiveInteger(parseOption(args, "--repeat") ?? "1", "--repeat");
  const failureTag = parseOption(args, "--failure-tag");
  const output = parseOption(args, "--output");
  const notes = parseOption(args, "--notes");

  return {
    ...(task ? { task } : {}),
    taskIds,
    profiles,
    execute: args.includes("--execute"),
    repeat,
    ...(output ? { output } : {}),
    ...(failureTag ? { failureTag } : {}),
    ...(manualSuccess ? { manualSuccess } : {}),
    ...(manualReworkValue ? { manualReworkMinutes: parseNonNegativeNumber(manualReworkValue) } : {}),
    ...(manualScoreValue ? { manualScore: parseScore(manualScoreValue) } : {}),
    ...(notes ? { notes } : {}),
  };
}

export function buildEvaluationReport(
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  options: ProfileEvalOptions,
  createdAt: Date = new Date(),
  taskCatalog: Record<string, ProfileEvaluationTask> = {},
  scoring: ProfileEvaluationScoring = {},
  taskSet = "custom",
): ProfileEvaluationReport {
  const tasks = resolveEvaluationTasks(options, taskCatalog);
  const runs = options.profiles.flatMap((profileId) =>
    tasks.flatMap((task) =>
      Array.from({ length: options.repeat }, (_, index) =>
        buildPlannedRun(profileId, task, index + 1, profilesConfig, modelsConfig, options),
      ),
    ),
  );

  return {
    protocol: "ai-share/profile-eval/v2",
    task_set: options.task ? "custom" : taskSet,
    execute: options.execute,
    created_at: createdAt.toISOString(),
    cost_basis: "config.models.cost per 1K tokens",
    scoring,
    tasks,
    runs,
    summary: buildSummary(options.profiles, runs),
  };
}

export function buildTaskCatalog(config: ProfileEvalYaml): Record<string, ProfileEvaluationTask> {
  return Object.fromEntries(
    Object.entries(config.tasks ?? {}).map(([taskId, task]) => {
      if (!task.prompt) throw new Error(`profile-eval task '${taskId}' 缺少 prompt。`);
      return [
        taskId,
        {
          id: taskId,
          title: task.title ?? taskId,
          category: task.category ?? "general",
          weight: task.weight ?? 1,
          prompt: task.prompt,
          success_criteria: task.success_criteria ?? [],
        },
      ];
    }),
  );
}

function main(args: readonly string[]): void {
  const profilesConfig = loadYaml("profiles.yaml") as ProfilesYaml;
  const modelsConfig = loadYaml("models.yaml") as ModelsYaml;
  const evalConfig = loadOptionalYaml("profile-eval.yaml") as ProfileEvalYaml;
  const taskCatalog = buildTaskCatalog(evalConfig);
  const options = parseProfileEvalArgs(args, Object.keys(profilesConfig), Object.keys(taskCatalog));
  const report = buildEvaluationReport(
    profilesConfig,
    modelsConfig,
    options,
    new Date(),
    taskCatalog,
    evalConfig.scoring ?? {},
    evalConfig.task_set ?? "default",
  );
  const outputPath = options.output ?? defaultOutputPath();

  if (options.execute) {
    for (const run of report.runs) {
      const task = report.tasks.find((candidate) => candidate.id === run.task_id);
      if (!task) throw new Error(`找不到 evaluation task：${run.task_id}`);
      executeRun(run, task.prompt, dirname(resolve(outputPath)), options);
    }
    report.summary = buildSummary(options.profiles, report.runs);
  }

  const writtenReport = writeReport(outputPath, report);
  console.log(`profile evaluation report：${writtenReport.jsonPath}`);
  console.log(`profile evaluation markdown：${writtenReport.markdownPath}`);
}

function buildPlannedRun(
  profileId: string,
  task: ProfileEvaluationTask,
  repeat: number,
  profilesConfig: ProfilesYaml,
  modelsConfig: ModelsYaml,
  options: ProfileEvalOptions,
): ProfileEvaluationRun {
  const profile = profilesConfig[profileId];
  if (!profile?.models?.primary || !profile.models.reasoning || !profile.models.fast) {
    throw new Error(`未知或不完整 profile：${profileId}`);
  }

  const primaryModel = requireModel(modelsConfig, profile.models.primary);
  const inputTokens = estimateTokens(task.prompt);
  const score = evaluationScore(options);
  return {
    profile: profileId,
    task_id: task.id,
    repeat,
    task_weight: task.weight,
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
      actual_elapsed_ms: null,
      stdout_path: null,
      stderr_path: null,
      failure_tag: options.failureTag ?? null,
      manual_success: options.manualSuccess ?? "unknown",
      manual_rework_minutes: options.manualReworkMinutes ?? null,
      manual_score: options.manualScore ?? null,
      score,
      score_basis: scoreBasis(options),
      notes: options.notes ?? "",
    },
  };
}

function executeRun(run: ProfileEvaluationRun, task: string, evidenceDir: string, options: ProfileEvalOptions): void {
  const startedAt = performance.now();
  const stdoutPath = resolve(
    evidenceDir,
    `${safeFileName(run.profile)}-${safeFileName(run.task_id)}-r${run.repeat}.stdout.txt`,
  );
  const stderrPath = resolve(
    evidenceDir,
    `${safeFileName(run.profile)}-${safeFileName(run.task_id)}-r${run.repeat}.stderr.txt`,
  );
  mkdirSync(evidenceDir, { recursive: true });
  const result = spawnSync("aiomx", [run.profile, "exec", task], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  writeFileSync(stdoutPath, result.stdout ?? "", "utf8");
  writeFileSync(stderrPath, result.stderr ?? "", "utf8");
  run.result.elapsed_ms = elapsedMs;
  run.result.actual_elapsed_ms = elapsedMs;
  run.result.exit_code = result.status ?? 1;
  run.result.status = result.status === 0 ? "success" : "failed";
  run.result.stdout_path = stdoutPath;
  run.result.stderr_path = stderrPath;
  run.result.failure_tag = run.result.status === "failed" ? (options.failureTag ?? "exit_nonzero") : null;
}

function resolveEvaluationTasks(
  options: ProfileEvalOptions,
  taskCatalog: Record<string, ProfileEvaluationTask>,
): ProfileEvaluationTask[] {
  if (options.task) {
    return [
      {
        id: "custom",
        title: "custom",
        category: "custom",
        weight: 1,
        prompt: options.task,
        success_criteria: [],
      },
    ];
  }

  return options.taskIds.map((taskId) => {
    const task = taskCatalog[taskId];
    if (!task) throw new Error(`未知 profile evaluation task：${taskId}`);
    return task;
  });
}

function buildSummary(profiles: readonly string[], runs: readonly ProfileEvaluationRun[]): ProfileEvaluationSummary[] {
  return profiles.map((profile) => {
    const profileRuns = runs.filter((run) => run.profile === profile);
    const scoredRuns = profileRuns.filter((run) => run.result.score !== null);
    const weight = scoredRuns.reduce((sum, run) => sum + run.task_weight, 0);
    const weightedScore =
      weight === 0
        ? null
        : roundScore(scoredRuns.reduce((sum, run) => sum + (run.result.score ?? 0) * run.task_weight, 0) / weight);
    return {
      profile,
      runs: profileRuns.length,
      scored_runs: scoredRuns.length,
      weighted_score: weightedScore,
      estimated_primary_cost_usd: roundUsd(
        profileRuns.reduce(
          (sum, run) => sum + run.estimate.primary_input_cost_usd + run.estimate.primary_max_output_cost_usd,
          0,
        ),
      ),
    };
  });
}

function parseOption(args: readonly string[], name: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === name) return args[index + 1];
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function positionalTask(args: readonly string[]): string | undefined {
  const optionsWithValue = new Set([
    "--task",
    "--tasks",
    "--task-id",
    "--profiles",
    "--profile",
    "--manual-success",
    "--manual-rework-minutes",
    "--manual-score",
    "--repeat",
    "--failure-tag",
    "--notes",
    "--output",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (optionsWithValue.has(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    return value;
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

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 必须是正整数：${value}`);
  return parsed;
}

function parseScore(value: string): number {
  const parsed = parseNonNegativeNumber(value);
  if (parsed > 100) throw new Error(`--manual-score 必须在 0 到 100 之间：${value}`);
  return parsed;
}

function evaluationScore(options: ProfileEvalOptions): number | null {
  if (options.manualScore !== undefined) return options.manualScore;
  if (options.manualSuccess === "success") return 100;
  if (options.manualSuccess === "failed") return 0;
  return null;
}

function scoreBasis(options: ProfileEvalOptions): "manual_score" | "manual_success" | "unscored" {
  if (options.manualScore !== undefined) return "manual_score";
  if (options.manualSuccess === "success" || options.manualSuccess === "failed") return "manual_success";
  return "unscored";
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

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-");
}

function loadYaml(fileName: string): object {
  return loadConfigYamlSync(resolve(projectRoot, "config"), fileName);
}

function loadOptionalYaml(fileName: string): object {
  const configDir = resolve(projectRoot, "config");
  const path = resolve(configDir, fileName);
  const localPath = resolve(configDir, "local", fileName);
  if (existsSync(path)) return loadConfigYamlSync(configDir, fileName);
  return existsSync(localPath) ? parseYamlObject(readFileSync(localPath, "utf8")) : {};
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

export function writeReport(
  outputPath: string,
  report: ProfileEvaluationReport,
): { jsonPath: string; markdownPath: string } {
  const resolvedOutputPath = resolve(outputPath);
  const markdownOutputPath = markdownReportPath(resolvedOutputPath);
  report.markdown_output_path = markdownOutputPath;
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownOutputPath, formatMarkdownReport(report), "utf8");
  return { jsonPath: resolvedOutputPath, markdownPath: markdownOutputPath };
}

function markdownReportPath(outputPath: string): string {
  return outputPath.endsWith(".json") ? outputPath.replace(/\.json$/, ".md") : `${outputPath}.md`;
}

export function formatMarkdownReport(report: ProfileEvaluationReport): string {
  const lines = [
    "# Profile evaluation report",
    "",
    `- protocol: ${report.protocol}`,
    `- task_set: ${report.task_set}`,
    `- execute: ${String(report.execute)}`,
    `- created_at: ${report.created_at}`,
    "",
    "## Summary",
    "",
    "| profile | runs | scored_runs | weighted_score | estimated_primary_cost_usd |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...report.summary.map(
      (summary) =>
        `| ${markdownCell(summary.profile)} | ${summary.runs} | ${summary.scored_runs} | ${summary.weighted_score ?? ""} | ${summary.estimated_primary_cost_usd} |`,
    ),
    "",
    "## Runs",
    "",
    "| profile | task | repeat | status | score | actual_elapsed_ms | failure_tag | stdout | stderr |",
    "| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |",
    ...report.runs.map(
      (run) =>
        `| ${markdownCell(run.profile)} | ${markdownCell(run.task_id)} | ${run.repeat} | ${run.result.status} | ${run.result.score ?? ""} | ${run.result.actual_elapsed_ms ?? ""} | ${markdownCell(run.result.failure_tag ?? "")} | ${markdownCell(run.result.stdout_path ?? "")} | ${markdownCell(run.result.stderr_path ?? "")} |`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function markdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function profileEvalUsage(availableProfiles: readonly string[], availableTaskIds: readonly string[]): string {
  return [
    "用法：bun run profile:eval -- [--tasks project_analysis,contract_test_patch] [--profiles coding,max] [--output <path>] [--execute]",
    "也可继续使用：bun run profile:eval -- --task <custom task>",
    `可用 profile：${availableProfiles.join(", ")}`,
    `固定任务：${availableTaskIds.join(", ") || "none"}`,
    "默认只写 planned report；传 --execute 才会实际运行 aiomx 并产生模型调用。",
  ].join("\n");
}

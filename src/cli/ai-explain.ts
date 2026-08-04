#!/usr/bin/env bun

import { ConfigValidationError, formatValidationError } from "../config/load.ts";
import { buildGenerationPreview, InvalidProviderError } from "../generation-preview.ts";
import { argsFromArgv, parseOptionValue } from "./args.ts";
import {
  buildExplainErrorReport,
  buildExplainReport,
  type ExplainErrorCode,
  type ExplainReport,
} from "./explain-report.ts";
import { renderExplainReport } from "./explain-output.ts";
import { resolveProviderDecision, resolveTaskDecision, type ProviderDecision, type TaskDecision } from "./options.ts";
import type { ProviderSelector } from "./provider-select.ts";

const VALUE_OPTIONS = new Set(["--provider", "--task"]);
const FLAG_OPTIONS = new Set(["--force", "--json"]);

export type ExplainOptions = {
  force: boolean;
  json: boolean;
  provider?: string;
  task?: string;
};

export type ExplainRunResult = {
  report: ExplainReport;
  json: boolean;
  exitCode: 0 | 1;
};

export function parseExplainOptions(argv: readonly string[] = Bun.argv): ExplainOptions {
  const args = argsFromArgv(argv);
  validateExplainArgs(args);
  const provider = parseOptionValue(args, "--provider", { missingValue: "error" });
  const task = parseOptionValue(args, "--task", { missingValue: "error" });
  return {
    force: args.includes("--force"),
    json: args.includes("--json"),
    ...(provider ? { provider } : {}),
    ...(task ? { task } : {}),
  };
}

export async function runExplain(
  input: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    projectRoot?: string;
    providerSelector?: ProviderSelector;
  } = {},
): Promise<ExplainRunResult> {
  const argv = input.argv ?? Bun.argv;
  const args = argsFromArgv(argv);
  const env = input.env ?? Bun.env;
  let options: ExplainOptions | undefined;

  try {
    options = parseExplainOptions(argv);
    const preview = await buildGenerationPreview({
      options: {
        force: options.force,
        dryRun: false,
        ...(options.provider ? { provider: options.provider } : {}),
        ...(options.task ? { task: options.task } : {}),
      },
      env,
      ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
      ...(input.providerSelector ? { providerSelector: input.providerSelector } : {}),
      interactiveProviderSelection: !options.json,
      interactiveOptionalSelection: false,
    });
    const report = buildExplainReport(preview);
    return { report, json: options.json, exitCode: report.status === "ok" ? 0 : 1 };
  } catch (error) {
    const json = options?.json ?? args.includes("--json");
    const force = options?.force ?? args.includes("--force");
    const report = buildExplainErrorReport({
      code: classifyExplainError(error),
      messages: explainErrorMessages(error),
      force,
      ...fallbackDecisions(options, env),
    });
    return { report, json, exitCode: 1 };
  }
}

export function formatExplainRunResult(
  result: ExplainRunResult,
  useColor: boolean = process.stdout.isTTY && process.env.NO_COLOR === undefined,
): string {
  return result.json ? JSON.stringify(result.report, null, 2) : renderExplainReport(result.report, useColor);
}

export function printExplainResult(
  result: ExplainRunResult,
  write: (content: string) => void = (content) => void process.stdout.write(content),
): number {
  write(`${formatExplainRunResult(result)}\n`);
  return result.exitCode;
}

if (import.meta.main) process.exitCode = printExplainResult(await runExplain());

function validateExplainArgs(args: readonly string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (FLAG_OPTIONS.has(arg)) continue;
    if ([...VALUE_OPTIONS].some((name) => arg.startsWith(`${name}=`))) continue;
    if (VALUE_OPTIONS.has(arg)) {
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }
}

function classifyExplainError(error: unknown): ExplainErrorCode {
  if (error instanceof ConfigValidationError) return "config-validation";
  if (error instanceof InvalidProviderError) return "invalid-provider";
  if (error instanceof Error && error.message === "已取消 Provider 选择。") return "cancelled";
  return "runtime";
}

function explainErrorMessages(error: unknown): string[] {
  if (error instanceof ConfigValidationError) return error.errors.map(formatValidationError);
  return [error instanceof Error ? error.message : String(error)];
}

function fallbackDecisions(
  options: ExplainOptions | undefined,
  env: Readonly<Record<string, string | undefined>>,
): { providerDecision?: ProviderDecision; taskDecision: TaskDecision } {
  const providerDecision = fallbackProviderDecision(options, env);
  const taskDecision = resolveTaskDecision({
    ...(options?.task ? { cliTask: options.task } : {}),
    ...(env.AI_SHARE_TASK ? { envTask: env.AI_SHARE_TASK } : {}),
  });
  return { ...(providerDecision ? { providerDecision } : {}), taskDecision };
}

function fallbackProviderDecision(
  options: ExplainOptions | undefined,
  env: Readonly<Record<string, string | undefined>>,
): ProviderDecision | undefined {
  if (options?.provider) return resolveProviderDecision({ cliProvider: options.provider, defaultProvider: "" });
  if (env.AI_SHARE_PROVIDER) {
    return resolveProviderDecision({ envProvider: env.AI_SHARE_PROVIDER, defaultProvider: "" });
  }
  return undefined;
}

#!/usr/bin/env bun

import { resolve } from "node:path";
import { buildWezTermLua } from "../config/builders/wezterm.ts";
import { loadWezTermConfig } from "../config/wezterm.ts";
import type { WezTermConfig } from "../types.ts";
import { argsFromArgv } from "./args.ts";
import { buildWezTermPaths, type WezTermPaths } from "./paths.ts";
import { selectWezTermConfigInteractive, type WezTermSelector } from "./wezterm-select.ts";
import { buildWezTermPlan, executeWezTermPlan, type WezTermPlan } from "./wezterm-plan.ts";

const WEZTERM_CONFIG_FLAGS = new Set(["--dry-run", "--non-interactive", "--force"]);

export type WezTermConfigOptions = {
  dryRun: boolean;
  nonInteractive: boolean;
  force: boolean;
};

export type WezTermConfigRunResult =
  | {
      ok: true;
      exitCode: 0;
      options: WezTermConfigOptions;
      config: WezTermConfig;
      paths: WezTermPaths;
      plan: WezTermPlan;
      executed: boolean;
    }
  | {
      ok: false;
      exitCode: 1;
      error: unknown;
      options?: WezTermConfigOptions;
      config?: WezTermConfig;
      paths?: WezTermPaths;
      plan?: WezTermPlan;
    };

export type WezTermConfigOutput = {
  stdout: string;
  stderr: string;
};

export type WezTermConfigWriters = {
  stdout: (content: string) => void;
  stderr: (content: string) => void;
};

type WezTermPlanExecutor = typeof executeWezTermPlan;

type WezTermConfigPreviewResult =
  | {
      ok: true;
      options: WezTermConfigOptions;
      config: WezTermConfig;
      paths: WezTermPaths;
      plan: WezTermPlan;
    }
  | Extract<WezTermConfigRunResult, { ok: false }>;

export type WezTermConfigRunInput = {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  platform?: string;
  projectRoot?: string;
  inputIsTTY?: boolean;
  outputIsTTY?: boolean;
  selector?: WezTermSelector;
  executePlan?: WezTermPlanExecutor;
};

export function parseWezTermConfigOptions(argv: readonly string[] = Bun.argv): WezTermConfigOptions {
  const args = argsFromArgv(argv);
  for (const arg of args) {
    if (!WEZTERM_CONFIG_FLAGS.has(arg)) throw new Error(`未知参数：${arg}`);
  }
  return {
    dryRun: args.includes("--dry-run"),
    nonInteractive: args.includes("--non-interactive"),
    force: args.includes("--force"),
  };
}

export async function runWezTermConfig(input: WezTermConfigRunInput = {}): Promise<WezTermConfigRunResult> {
  const preview = await buildWezTermConfigPreview(input);
  if (!preview.ok) return preview;

  const { options, config, paths, plan } = preview;
  if (plan.kind === "collision") return failureResult(collisionError(plan.path), preview);

  try {
    if (!options.dryRun) {
      const stagingRoot = resolve(paths.targetWezTermConfigDir, ".ai-share-staging");
      await (input.executePlan ?? executeWezTermPlan)(plan, paths, stagingRoot);
    }
    return { ok: true, exitCode: 0, options, config, paths, plan, executed: !options.dryRun };
  } catch (error) {
    return failureResult(error, preview);
  }
}

export async function runWezTermConfigCommand(
  input: WezTermConfigRunInput = {},
  writers: WezTermConfigWriters = defaultWriters(),
): Promise<0 | 1> {
  const preview = await buildWezTermConfigPreview(input);
  if (!preview.ok) return printWezTermConfigResult(preview, writers);

  writers.stdout(formatWezTermConfigPreview(preview.config, preview.plan));
  if (preview.plan.kind === "collision") {
    writers.stderr(`${collisionError(preview.plan.path).message}\n`);
    return 1;
  }
  if (preview.options.dryRun) {
    writers.stdout("dry-run：未写入文件。\n");
    return 0;
  }

  try {
    const stagingRoot = resolve(preview.paths.targetWezTermConfigDir, ".ai-share-staging");
    await (input.executePlan ?? executeWezTermPlan)(preview.plan, preview.paths, stagingRoot);
    writers.stdout("完成：WezTerm 配置已处理。\n");
    return 0;
  } catch (error) {
    writers.stderr(`WezTerm 配置写入失败：${errorMessage(error)}\n`);
    return 1;
  }
}

async function buildWezTermConfigPreview(input: WezTermConfigRunInput): Promise<WezTermConfigPreviewResult> {
  let options: WezTermConfigOptions | undefined;
  let config: WezTermConfig | undefined;
  let paths: WezTermPaths | undefined;
  let plan: WezTermPlan | undefined;

  try {
    options = parseWezTermConfigOptions(input.argv ?? Bun.argv);
    const platform = input.platform ?? process.platform;
    assertSupportedPlatform(platform);

    paths = buildWezTermPaths(input.env ?? Bun.env);
    const projectRoot = input.projectRoot ?? resolve(import.meta.dir, "..", "..");
    config = await loadWezTermConfig(resolve(projectRoot, "config"));

    const interactive =
      !options.nonInteractive &&
      (input.inputIsTTY ?? process.stdin.isTTY) &&
      (input.outputIsTTY ?? process.stdout.isTTY);
    if (interactive) config = await (input.selector ?? selectWezTermConfigInteractive)(config);

    const content = buildWezTermLua(config);
    plan = await buildWezTermPlan({ paths, content, force: options.force });
    return { ok: true, options, config, paths, plan };
  } catch (error) {
    return failureResult(error, {
      ...(options ? { options } : {}),
      ...(config ? { config } : {}),
      ...(paths ? { paths } : {}),
      ...(plan ? { plan } : {}),
    });
  }
}

export function formatWezTermConfigResult(result: WezTermConfigRunResult): WezTermConfigOutput {
  const stdout: string[] = [];
  if (result.config) stdout.push(formatWezTermConfigSummary(result.config));
  if (result.plan) {
    const prefix = result.options?.dryRun ? "PLAN" : "APPLY";
    stdout.push(`${prefix} ${result.plan.kind.toUpperCase()} ${result.plan.path}`);
  }
  if (result.ok) stdout.push(result.options.dryRun ? "dry-run：未写入文件。" : "完成：WezTerm 配置已处理。");

  return {
    stdout: stdout.length > 0 ? `${stdout.join("\n")}\n` : "",
    stderr: result.ok ? "" : `${errorMessage(result.error)}\n`,
  };
}

export function printWezTermConfigResult(
  result: WezTermConfigRunResult,
  writers: WezTermConfigWriters = defaultWriters(),
): 0 | 1 {
  const output = formatWezTermConfigResult(result);
  if (output.stdout) writers.stdout(output.stdout);
  if (output.stderr) writers.stderr(output.stderr);
  return result.exitCode;
}

function assertSupportedPlatform(platform: string): void {
  if (platform !== "win32" && platform !== "darwin") {
    throw new Error(`当前平台不支持生成 WezTerm 配置：${platform}`);
  }
}

function formatWezTermConfigSummary(config: WezTermConfig): string {
  return [
    "WezTerm 配置摘要：",
    `shell: ${config.shell}`,
    `color_scheme: ${config.color_scheme}`,
    `font_size: ${config.font_size}`,
    `window_background_opacity: ${config.window_background_opacity}`,
    `maximize_on_startup: ${config.maximize_on_startup}`,
    `scrollback_lines: ${config.scrollback_lines}`,
  ].join("\n");
}

function formatWezTermConfigPreview(config: WezTermConfig, plan: WezTermPlan): string {
  return `${formatWezTermConfigSummary(config)}\nPLAN ${plan.kind.toUpperCase()} ${plan.path}\n`;
}

function collisionError(path: string): Error {
  return new Error(`WezTerm 目标存在未受管冲突：${path}。未写入任何文件；确认后可使用 --force 显式接管。`);
}

function failureResult(
  error: unknown,
  state: {
    options?: WezTermConfigOptions;
    config?: WezTermConfig;
    paths?: WezTermPaths;
    plan?: WezTermPlan;
  },
): Extract<WezTermConfigRunResult, { ok: false }> {
  return {
    ok: false,
    exitCode: 1,
    error,
    ...(state.options ? { options: state.options } : {}),
    ...(state.config ? { config: state.config } : {}),
    ...(state.paths ? { paths: state.paths } : {}),
    ...(state.plan ? { plan: state.plan } : {}),
  };
}

function defaultWriters(): WezTermConfigWriters {
  return {
    stdout: (content) => void process.stdout.write(content),
    stderr: (content) => void process.stderr.write(content),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) process.exitCode = await runWezTermConfigCommand();

#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { argsFromArgv, hasFlag } from "./args.ts";

const DEFAULT_PROXY = "http://127.0.0.1:7897";
const ARCHIFY_REPO = "tt-a1i/archify";
const ARCHIFY_SKILL = "archify";

type ArchifyCommand = "install" | "update";

export type ArchifyInstallOptions = {
  command: ArchifyCommand;
  useProxy: boolean;
};

export type ArchifyCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type ArchifyInstallRunner = (args: readonly string[], env: Record<string, string>) => ArchifyCommandResult;

export type ArchifyInstallRunResult =
  | {
      ok: true;
      options: ArchifyInstallOptions;
      stdout: string;
      stderr: string;
    }
  | { ok: false; error: unknown };

export function parseArchifyInstallOptions(argv: readonly string[] = Bun.argv): ArchifyInstallOptions {
  const args = argsFromArgv(argv);
  let command: ArchifyCommand = "install";
  for (const value of args) {
    if (!value.startsWith("--") && (value === "install" || value === "update")) {
      command = value;
    } else if (!value.startsWith("--")) {
      throw new Error(`未知参数：${value}`);
    }
  }
  const useProxy = hasFlag(args, "--proxy") || !hasFlag(args, "--no-proxy");
  return { command, useProxy };
}

export function buildArchifySkillsCommand(command: ArchifyCommand): string[] {
  if (command === "update") {
    return ["x", "skills", "update", ARCHIFY_SKILL, "--global", "--yes"];
  }
  return [
    "x",
    "skills",
    "add",
    ARCHIFY_REPO,
    "--skill",
    ARCHIFY_SKILL,
    "--agent",
    "opencode",
    "--global",
    "--copy",
    "--yes",
  ];
}

export function runArchifyInstall(
  input: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    runner?: ArchifyInstallRunner;
  } = {},
): ArchifyInstallRunResult {
  try {
    const options = parseArchifyInstallOptions(input.argv ?? Bun.argv);
    const env = input.env ?? Bun.env;
    const runner = input.runner ?? spawnArchifyCommand;
    const args = buildArchifySkillsCommand(options.command);
    const proxy = options.useProxy ? (env.HTTPS_PROXY ?? env.HTTP_PROXY ?? DEFAULT_PROXY) : undefined;
    const runEnv: Record<string, string> = proxy ? { HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : {};
    const result = runner(args, runEnv);
    if (result.status !== 0) {
      const detail = result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status ?? "unknown"}`;
      throw new Error(`archify ${options.command} 执行失败：${detail}`, { cause: result.error });
    }
    return { ok: true, options, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, error };
  }
}

export function printArchifyInstallResult(
  result: ArchifyInstallRunResult,
  write: (content: string) => void = console.log,
): number {
  if (!result.ok) {
    write(
      `archify 安装失败：${result.error instanceof Error ? result.error.message : String(result.error)}\n如需走本地代理，请确认 127.0.0.1:7897 可用，或用 --proxy/--no-proxy 控制。`,
    );
    return 1;
  }
  if (result.options.command === "update") {
    write(`archify 已更新：\n${trim(result.stdout)}\n${trim(result.stderr)}`.trim());
  } else {
    write(`已安装 archify 到本机 OpenCode（全局）skills 目录：\n${trim(result.stdout)}\n${trim(result.stderr)}`.trim());
  }
  return 0;
}

function trim(value: string): string {
  return value.trim();
}

function spawnArchifyCommand(args: readonly string[], proxyEnv: Record<string, string>): ArchifyCommandResult {
  const result = spawnSync("bun", [...args], {
    encoding: "utf8",
    env: { ...process.env, ...proxyEnv },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  };
}

if (import.meta.main) process.exitCode = printArchifyInstallResult(runArchifyInstall());

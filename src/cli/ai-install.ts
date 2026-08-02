#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadValidatedConfig } from "../config/load.ts";
import { createColor } from "./color.ts";
import { pathExists } from "./fs.ts";
import { argsFromArgv } from "./args.ts";
import {
  INSTALL_TOOLS,
  buildInstallHints,
  buildInstalledToolIds,
  parseBrewCaskInstalled,
  parsePnpmGlobalPackages,
  parseScoopInstalled,
  requireSupportedPlatform,
  type InstallHint,
  type InstallToolId,
} from "./install-plan.ts";
import { buildGeneratorPaths } from "./paths.ts";

export type InstallOptions = Record<never, never>;

export type InstallCommand = {
  command: string;
  args: string[];
  cwd: string;
};

export type InstallCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type InstallRunner = (command: InstallCommand) => Promise<InstallCommandResult>;

export type InstallToolStatus = {
  id: InstallToolId;
  label: string;
  installed: boolean;
};

export type InstallRunResult =
  | { ok: true; tools: readonly InstallToolStatus[]; hints: readonly InstallHint[] }
  | { ok: false; error: unknown };

export function parseInstallOptions(argv: readonly string[] = Bun.argv): InstallOptions {
  const args = argsFromArgv(argv);
  if (args.length > 0) throw new Error(`未知参数：${args[0]}`);
  return {};
}

export async function runInstall(
  input: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    projectRoot?: string;
    platform?: NodeJS.Platform;
    runner?: InstallRunner;
  } = {},
): Promise<InstallRunResult> {
  try {
    parseInstallOptions(input.argv ?? Bun.argv);
    const env = input.env ?? Bun.env;
    const projectRoot = input.projectRoot ?? resolve(import.meta.dir, "..", "..");
    const platform = requireSupportedPlatform(input.platform ?? process.platform);
    const paths = buildGeneratorPaths(projectRoot, env);
    const config = await loadValidatedConfig(paths.configDir);
    const runner = input.runner ?? spawnInstallCommand;
    const userPluginSpecs = await readUserPluginSpecs(paths.targetOpenCodeConfig);
    const detected = await detectInstalledTools(platform, tmpdir(), runner, [
      ...config.plugins.plugins,
      ...userPluginSpecs,
    ]);
    const tools = INSTALL_TOOLS.map((tool) => ({
      id: tool.id,
      label: tool.label,
      installed: detected.installedIds.has(tool.id),
    }));
    const missingIds = new Set(tools.filter((tool) => !tool.installed).map((tool) => tool.id));
    const hints: InstallHint[] = buildInstallHints(platform, missingIds, detected.scoopExtrasAvailable).map(
      (hint): InstallHint =>
        hint.kind === "configure-superpowers"
          ? { ...hint, configPath: paths.targetOpenCodeConfig }
          : hint.kind === "configure-openspec" || hint.kind === "configure-openspec-after-install"
            ? { ...hint, projectRoot }
            : hint,
    );
    if (
      detected.installedIds.has("opencode") &&
      detected.installedIds.has("openspec") &&
      !(await pathExists(resolve(projectRoot, "openspec")))
    ) {
      hints.push({ kind: "configure-openspec", toolId: "openspec", command: "openspec", args: ["init"] });
    } else if (detected.installedIds.has("opencode") && !detected.installedIds.has("openspec")) {
      hints.push({
        kind: "configure-openspec-after-install",
        toolId: "openspec",
        command: "openspec",
        args: ["init"],
      });
    }
    if (
      detected.installedIds.has("opencode") &&
      detected.installedIds.has("openspec") &&
      detected.installedIds.has("superpowers") &&
      (await pathExists(resolve(projectRoot, "openspec"))) &&
      !(await hasOpenSpecSuperpowersConfig(projectRoot))
    ) {
      hints.push({ kind: "configure-openspec-superpowers", toolId: "superpowers" });
    }
    return { ok: true, tools, hints };
  } catch (error) {
    return { ok: false, error };
  }
}

export function formatInstallRunResult(
  result: InstallRunResult,
  useColor: boolean = process.stdout.isTTY && process.env.NO_COLOR === undefined,
): string {
  const palette = createColor(useColor);
  if (!result.ok)
    return palette.red(`检测失败：${result.error instanceof Error ? result.error.message : String(result.error)}`);
  const lines = [palette.bold(palette.cyan("工具安装状态："))];
  for (const tool of result.tools) {
    const status = tool.installed ? palette.green("已安装") : palette.yellow("未安装");
    lines.push(`- ${tool.label}：${status}`);
  }
  const usageHints = result.hints.filter(
    (hint) => hint.kind === "configure-openspec" || hint.kind === "configure-openspec-after-install",
  );
  const openspecInstalled = result.tools.some((tool) => tool.id === "openspec" && tool.installed);
  const codegraphInstalled = result.tools.some((tool) => tool.id === "codegraph" && tool.installed);
  const superpowersInstalled = result.tools.some((tool) => tool.id === "superpowers" && tool.installed);
  if (usageHints.length > 0 || openspecInstalled || codegraphInstalled || superpowersInstalled) {
    lines.push("", palette.bold(palette.cyan("使用提示：")));
    if (usageHints.length > 0 || openspecInstalled) {
      lines.push(palette.bold(palette.cyan("OpenSpec")));
      for (const hint of usageHints) {
        const prefix = hint.kind === "configure-openspec" ? "初始化" : "安装后初始化";
        lines.push(palette.yellow(`  ${prefix}`));
        lines.push(palette.white(`    在项目根目录执行：${hint.command} ${hint.args.join(" ")}`));
      }
      if (openspecInstalled) {
        lines.push(palette.yellow("  会话使用"));
        lines.push(palette.white("    启动 OpenCode 后，直接描述需求，例如：使用 OpenSpec 创建变更提案"));
      }
    }
    if (codegraphInstalled) {
      if (usageHints.length > 0 || openspecInstalled) lines.push("");
      lines.push(palette.bold(palette.cyan("CodeGraph")));
      lines.push(palette.yellow("  会话使用"));
      lines.push(palette.white("    启动 OpenCode 后，直接请求：使用 CodeGraph 分析当前项目代码"));
    }
    if (superpowersInstalled) {
      if (usageHints.length > 0 || openspecInstalled || codegraphInstalled) lines.push("");
      lines.push(palette.bold(palette.cyan("Superpowers")));
      lines.push(palette.yellow("  会话使用"));
      lines.push(palette.white("    启动 OpenCode 后，直接请求：使用 Superpowers 执行当前任务"));
    }
  }
  if (result.hints.length === 0) return [...lines, palette.green("所有工具均已安装或配置。")].join("\n");
  const installHints = result.hints.filter((hint) => hint.kind === "command" || hint.kind === "prepare-scoop-extras");
  const configHints = result.hints.filter(
    (hint) =>
      hint.kind !== "command" &&
      hint.kind !== "prepare-scoop-extras" &&
      hint.kind !== "configure-openspec" &&
      hint.kind !== "configure-openspec-after-install",
  );
  if (installHints.length > 0) {
    lines.push("", palette.bold(palette.yellow("安装指令：")));
    for (const hint of installHints) {
      if (hint.kind === "command" || hint.kind === "prepare-scoop-extras") {
        lines.push(palette.yellow(`- 执行：${hint.command} ${hint.args.join(" ")}`));
      }
    }
  }
  if (configHints.length > 0) lines.push("", palette.bold(palette.magenta("配置提示：")));
  for (const hint of configHints) {
    if (hint.kind === "configure-superpowers") {
      lines.push(palette.magenta("- Superpowers：请执行 bun run ai:gen，并在可选插件配置步骤中选择 Superpowers"));
      lines.push(palette.white("  ai:gen 会将选择写入用户级 OpenCode 配置"));
    } else if (hint.kind === "configure-openspec-superpowers") {
      lines.push(palette.magenta("- OpenSpec：已安装 Superpowers，但尚未在 OpenSpec 配置中启用"));
      lines.push(palette.white("  请在 openspec 配置中加入 Superpowers 集成后重新运行检测"));
    }
  }
  return lines.join("\n");
}

export function printInstallResult(result: InstallRunResult, write: (content: string) => void = console.log): number {
  write(formatInstallRunResult(result));
  return result.ok ? 0 : 1;
}

if (import.meta.main) process.exitCode = printInstallResult(await runInstall());

async function detectInstalledTools(
  platform: "win32" | "darwin",
  cwd: string,
  runner: InstallRunner,
  pluginSpecs: readonly string[],
): Promise<{ installedIds: Set<InstallToolId>; scoopExtrasAvailable: boolean }> {
  const pnpmCommand = {
    command: "pnpm",
    args: ["list", "--global", "--depth", "0", "--json"],
    cwd,
  } satisfies InstallCommand;
  const pnpmResult = await runner(pnpmCommand);
  const pnpmPackages = isMissingExecutable(pnpmResult) ? new Set<string>() : parsePnpmResult(pnpmResult, pnpmCommand);
  const opencodeResult = await runner({ command: "opencode", args: ["--version"], cwd });
  // A broken runtime/config can make `opencode --version` exit non-zero even
  // though the executable is installed. `spawnSync` reports a missing command
  // through `error`, so use that as the installation signal instead of status.
  if (opencodeResult.status !== null && !opencodeResult.error) pnpmPackages.add("opencode-ai");
  const systemPackages = new Set<string>();
  let scoopExtrasAvailable = false;
  if (platform === "win32") {
    const scoopCommand = { command: "scoop", args: ["list"], cwd } satisfies InstallCommand;
    const scoop = await runner(scoopCommand);
    if (!isMissingExecutable(scoop)) {
      const validScoop = runProbeResult(
        scoop,
        scoopCommand,
        (result) => result.status === 1 && /There aren't any apps installed\.?/i.test(result.stdout),
      );
      for (const name of parseScoopInstalled(validScoop.stdout).keys()) systemPackages.add(name);
    }
    const bucketCommand = { command: "scoop", args: ["bucket", "list"], cwd } satisfies InstallCommand;
    const buckets = await runner(bucketCommand);
    if (!isMissingExecutable(buckets) && buckets.status === 0)
      scoopExtrasAvailable = stripAnsi(buckets.stdout)
        .split(/\r?\n/)
        .some((line) => /^\s*extras\s+/i.test(line));
  } else {
    const brewCommand = { command: "brew", args: ["list", "--cask", "--versions"], cwd } satisfies InstallCommand;
    const brew = await runner(brewCommand);
    if (!isMissingExecutable(brew)) {
      const validBrew = runCheckedResult(brew, brewCommand);
      for (const name of parseBrewCaskInstalled(validBrew.stdout)) systemPackages.add(name);
    }
  }
  return { installedIds: buildInstalledToolIds({ pnpmPackages, systemPackages, pluginSpecs }), scoopExtrasAvailable };
}

function stripAnsi(value: string): string {
  // ANSI escape sequences begin with ESC (0x1b), which is intentional here.
  // eslint-disable-next-line no-control-regex
  return value.replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function parsePnpmResult(result: InstallCommandResult, command: InstallCommand): Set<string> {
  const valid = runCheckedResult(result, command);
  return parsePnpmGlobalPackages(valid.stdout);
}

function runCheckedResult(result: InstallCommandResult, command: InstallCommand): InstallCommandResult {
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status ?? "unknown"}`;
    throw new Error(`${command.command} ${command.args.join(" ")} 执行失败：${detail}`, { cause: result.error });
  }
  return result;
}

function runProbeResult(
  result: InstallCommandResult,
  command: InstallCommand,
  allowNonZero: (result: InstallCommandResult) => boolean,
): InstallCommandResult {
  if (result.error || (result.status !== 0 && !allowNonZero(result))) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status ?? "unknown"}`;
    throw new Error(`${command.command} ${command.args.join(" ")} 执行失败：${detail}`, { cause: result.error });
  }
  return result;
}

function isMissingExecutable(result: InstallCommandResult): boolean {
  return result.error?.message.includes("Executable not found") === true;
}

async function hasOpenSpecSuperpowersConfig(projectRoot: string): Promise<boolean> {
  for (const relativePath of ["openspec/config.yaml", "openspec/config.yml", "openspec/config.json"]) {
    try {
      if ((await readFile(resolve(projectRoot, relativePath), "utf8")).toLowerCase().includes("superpowers"))
        return true;
    } catch {
      // Missing optional config files mean OpenSpec integration is not configured.
    }
  }
  return false;
}

async function readUserPluginSpecs(configPath: string): Promise<readonly string[]> {
  try {
    const content = await readFile(configPath, "utf8");
    if (!/superpowers/i.test(content)) return [];
    return ["superpowers@git+https://github.com/obra/superpowers.git"];
  } catch {
    return [];
  }
}

export function resolveInstallExecutable(platform: NodeJS.Platform, command: string): string {
  if (platform === "win32" && (command === "pnpm" || command === "scoop")) {
    return `${command}.cmd`;
  }
  return command;
}

function spawnInstallCommand(command: InstallCommand): Promise<InstallCommandResult> {
  const result = spawnSync(resolveInstallExecutable(process.platform, command.command), command.args, {
    cwd: command.cwd,
    encoding: "utf8",
    env: process.env,
  });
  return Promise.resolve({
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  });
}

#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadValidatedConfig } from "../config/load.ts";
import { StagedFileWriter, pathExists } from "./fs.ts";
import { argsFromArgv } from "./args.ts";
import { buildGeneratorPaths } from "./paths.ts";
import { selectInstallInteractive, type InstallChoice } from "./install-select.ts";
import {
  INSTALL_TOOLS,
  SUPERPOWERS_PLUGIN_SPEC,
  buildInstallActions,
  buildInstalledToolIds,
  collectScoopGlobalIds,
  parseBrewCaskInstalled,
  parsePnpmGlobalPackages,
  parseScoopInstalled,
  requireSupportedPlatform,
  type InstallAction,
  type InstallToolId,
} from "./install-plan.ts";

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

export type InstallChoiceSelector = (choices: readonly InstallChoice[]) => Promise<ReadonlySet<string>>;

export type InstallRunResult =
  | { ok: true; installedIds: ReadonlySet<InstallToolId>; actions: readonly InstallAction[] }
  | { ok: false; error: unknown; actions?: readonly InstallAction[] };

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
    select?: InstallChoiceSelector;
    selectUpgrade?: InstallChoiceSelector;
    write?: (content: string) => void;
  } = {},
): Promise<InstallRunResult> {
  let actions: readonly InstallAction[] | undefined;
  let rollbackOverlay: (() => Promise<void>) | undefined;
  try {
    parseInstallOptions(input.argv ?? Bun.argv);
    const env = input.env ?? Bun.env;
    const projectRoot = input.projectRoot ?? resolve(import.meta.dir, "..", "..");
    const platform = requireSupportedPlatform(input.platform ?? process.platform);
    const paths = buildGeneratorPaths(projectRoot, env);
    const config = await loadValidatedConfig(paths.configDir);
    const runner = input.runner ?? spawnInstallCommand;
    const detected = await detectInstalledTools(platform, tmpdir(), runner, config.plugins.plugins);
    const choices = INSTALL_TOOLS.map((tool) => ({
      id: tool.id,
      label: tool.label,
      required: tool.required,
      selected: tool.required,
      status: detected.installedIds.has(tool.id) ? "已安装" : "未安装",
    }));
    const selected = await (input.select ?? ((items) => selectInstallInteractive(items)))(choices);
    const selectedIds = new Set<InstallToolId>([...selected].filter(isInstallToolId));
    for (const tool of INSTALL_TOOLS) if (tool.required) selectedIds.add(tool.id);

    const upgradeChoices = choices
      .filter((choice) => detected.installedIds.has(choice.id) && choice.id !== "superpowers")
      .map((choice) => ({ ...choice, required: false, selected: false }));
    const upgrade =
      upgradeChoices.length > 0
        ? await (input.selectUpgrade ?? input.select ?? ((items) => selectInstallInteractive(items)))(upgradeChoices)
        : new Set<string>();
    const upgradeIds = new Set<InstallToolId>([...upgrade].filter(isInstallToolId));
    actions = buildInstallActions({
      platform,
      selectedIds,
      installedIds: detected.installedIds,
      upgradeIds,
      scoopGlobalIds: detected.scoopGlobalIds,
      scoopExtrasAvailable: detected.scoopExtrasAvailable,
    });
    const write = input.write ?? ((line) => console.log(line));
    for (const action of actions) write(formatInstallAction(action));
    if (actions.some((action) => action.kind === "configure-superpowers")) write("执行：bun run ai:gen");

    const superpowersAction = actions.find((action) => action.kind === "configure-superpowers");
    for (const action of actions) {
      if (action.kind === "configure-superpowers") continue;
      await runChecked(runner, {
        command: action.command,
        args: action.args,
        cwd: action.command === "pnpm" ? tmpdir() : projectRoot,
      });
    }
    if (superpowersAction) {
      rollbackOverlay = await enableSuperpowers(paths.configDir, config.plugins.plugins);
      await runChecked(runner, { command: "bun", args: ["run", "ai:gen"], cwd: projectRoot });
      rollbackOverlay = undefined;
    }
    const installedIds = new Set(detected.installedIds);
    for (const action of actions) {
      if (action.kind === "command") installedIds.add(action.toolId);
      else if (action.kind === "configure-superpowers") installedIds.add(action.toolId);
    }
    return { ok: true, installedIds, actions };
  } catch (error) {
    if (rollbackOverlay) {
      try {
        await rollbackOverlay();
      } catch (rollbackError) {
        return {
          ok: false,
          error: new AggregateError([error, rollbackError], "安装失败且插件配置回滚失败。"),
          ...(actions ? { actions } : {}),
        };
      }
    }
    return { ok: false, error, ...(actions ? { actions } : {}) };
  }
}

export function formatInstallRunResult(result: InstallRunResult): string {
  if (!result.ok) return `安装失败：${result.error instanceof Error ? result.error.message : String(result.error)}`;
  return `安装完成：actions=${result.actions.length}`;
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
): Promise<{
  installedIds: Set<InstallToolId>;
  scoopGlobalIds: Set<InstallToolId>;
  scoopExtrasAvailable: boolean;
}> {
  const pnpm = await runChecked(runner, {
    command: "pnpm",
    args: ["list", "--global", "--depth", "0", "--json"],
    cwd,
  });
  const pnpmPackages = parsePnpmGlobalPackages(pnpm.stdout);
  const systemPackages = new Set<string>();
  let scoopGlobalIds = new Set<InstallToolId>();
  let scoopExtrasAvailable = true;
  if (platform === "win32") {
    const scoop = await runChecked(runner, { command: "scoop", args: ["list"], cwd });
    const parsed = parseScoopInstalled(scoop.stdout);
    for (const name of parsed.keys()) systemPackages.add(name);
    scoopGlobalIds = collectScoopGlobalIds(parsed);
    const buckets = await runChecked(runner, { command: "scoop", args: ["bucket", "list"], cwd });
    scoopExtrasAvailable = hasScoopExtras(buckets.stdout);
  } else {
    const brew = await runChecked(runner, { command: "brew", args: ["list", "--cask", "--versions"], cwd });
    for (const name of parseBrewCaskInstalled(brew.stdout)) systemPackages.add(name);
  }
  return {
    installedIds: buildInstalledToolIds({ pnpmPackages, systemPackages, pluginSpecs }),
    scoopGlobalIds,
    scoopExtrasAvailable,
  };
}

async function runChecked(runner: InstallRunner, command: InstallCommand): Promise<InstallCommandResult> {
  const result = await runner(command);
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status ?? "unknown"}`;
    throw new Error(`${command.command} ${command.args.join(" ")} 执行失败：${detail}`, { cause: result.error });
  }
  return result;
}

async function enableSuperpowers(configDir: string, existingPlugins: readonly string[]): Promise<() => Promise<void>> {
  const localPath = resolve(configDir, "local", "plugins.yaml");
  const hadExisting = await pathExists(localPath);
  const original = hadExisting ? await readFile(localPath, "utf8") : undefined;
  const plugins = [...new Set([...existingPlugins, SUPERPOWERS_PLUGIN_SPEC])];
  const writer = await StagedFileWriter.create(resolve(configDir, "local", ".ai-share-staging"));
  const restore = async (): Promise<void> => {
    const rollbackWriter = await StagedFileWriter.create(resolve(configDir, "local", ".ai-share-staging"));
    if (original === undefined) rollbackWriter.delete(localPath);
    else await rollbackWriter.writeText(localPath, original);
    await rollbackWriter.promote();
  };
  try {
    await writer.writeText(localPath, `${Bun.YAML.stringify({ plugins })}\n`);
    await writer.promote();
  } catch (error) {
    try {
      await restore();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Superpowers overlay 写入失败且回滚失败。", { cause: error });
    }
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }
  return restore;
}

export function resolveInstallExecutable(platform: NodeJS.Platform, command: string): string {
  if (platform === "win32" && (command === "pnpm" || command === "scoop")) return `${command}.cmd`;
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

function hasScoopExtras(text: string): boolean {
  return text
    .split("\n")
    .map(stripAnsi)
    .some((line) => /^\s*extras\s+/i.test(line) || /^\s*Name\s*:\s*extras\s*$/i.test(line));
}

function stripAnsi(value: string): string {
  let output = "";
  let inEscape = false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (!inEscape && code === 0x1b) {
      inEscape = true;
      continue;
    }
    if (inEscape) {
      if (code >= 0x40 && code <= 0x7e && code !== 0x5b) inEscape = false;
      continue;
    }
    output += character;
  }
  return output;
}

function isInstallToolId(value: string): value is InstallToolId {
  return INSTALL_TOOLS.some((tool) => tool.id === value);
}

function formatInstallAction(action: InstallAction): string {
  if (action.kind === "configure-superpowers") return "配置 Superpowers canonical plugin";
  return `执行：${action.command} ${action.args.join(" ")}`;
}

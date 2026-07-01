import { cp, mkdir, rm } from "node:fs/promises";
import { basename, dirname, parse, resolve, sep } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { color } from "./color.ts";
import { pathExists } from "./fs.ts";
import { buildGeneratorPaths } from "./paths.ts";

export type CleanOptions = {
  backup: boolean | undefined;
};

export type CleanResult = {
  targetPath: string;
  removed: boolean;
  backupPath?: string;
};

const timestampPattern = /[:.]/g;

if (import.meta.main) {
  const paths = buildGeneratorPaths();
  const options = parseCleanOptions(Bun.argv);
  const backup = await resolveBackupOption(options.backup);
  const result = await cleanCodexConfig(paths, { backup });
  printCleanResult(result);
}

export function parseCleanOptions(argv: readonly string[] = Bun.argv): CleanOptions {
  const backupValue = parseOption(argv, "--backup");
  const noBackup = argv.slice(2).includes("--no-backup");
  if (backupValue !== undefined && noBackup) throw new Error("--backup 与 --no-backup 不能同时使用。");
  if (noBackup) return { backup: false };
  if (backupValue === undefined) return { backup: undefined };
  return { backup: parseBooleanOption("--backup", backupValue) };
}

export async function resolveBackupOption(value: boolean | undefined): Promise<boolean> {
  if (value !== undefined) return value;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;
  return await askYesNo("是否先备份现有 Codex 配置？", true);
}

export async function cleanCodexConfig(paths: GeneratorPaths, options: { backup: boolean }): Promise<CleanResult> {
  const targetPath = resolve(paths.targetCodexConfigDir);
  assertSafeCodexConfigTarget(paths.homeDir, targetPath);

  if (!(await pathExists(targetPath))) {
    return { targetPath, removed: false };
  }

  let backupPath: string | undefined;
  if (options.backup) {
    backupPath = await nextBackupPath(paths.homeDir);
    await mkdir(dirname(backupPath), { recursive: true });
    await cp(targetPath, backupPath, { recursive: true, errorOnExist: true, force: false });
  }

  await rm(targetPath, { recursive: true, force: true });
  return backupPath === undefined ? { targetPath, removed: true } : { targetPath, removed: true, backupPath };
}

function printCleanResult(result: CleanResult): void {
  if (!result.removed) {
    console.log(`${color.yellow("跳过")} Codex 配置目录不存在：${color.bold(result.targetPath)}`);
    return;
  }

  if (result.backupPath) {
    console.log(`${color.green("已备份")} Codex 配置：${color.bold(result.backupPath)}`);
  }
  console.log(`${color.green("已清理")} Codex 配置目录：${color.bold(result.targetPath)}`);
}

function parseOption(argv: readonly string[], name: string): string | undefined {
  const values = argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1] ?? "true";
    if (value?.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return undefined;
}

function parseBooleanOption(name: string, value: string): boolean {
  if (["1", "true", "yes", "y"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "n"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} 只支持 true/false：${value}`);
}

async function askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? "Y/n" : "y/N";
  process.stdout.write(`${question} (${suffix}) `);
  const answer = await new Promise<string>((resolveAnswer) => {
    process.stdin.resume();
    process.stdin.once("data", (data) => resolveAnswer(data.toString("utf8").trim().toLowerCase()));
  });
  process.stdin.pause();
  if (answer === "") return defaultValue;
  if (["y", "yes", "1", "true"].includes(answer)) return true;
  if (["n", "no", "0", "false"].includes(answer)) return false;
  return defaultValue;
}

async function nextBackupPath(homeDir: string): Promise<string> {
  const backupRoot = resolve(homeDir, ".codex-backups");
  const baseName = `codex-config-${new Date().toISOString().replace(timestampPattern, "-")}`;
  let candidate = resolve(backupRoot, baseName);
  for (let index = 2; await pathExists(candidate); index += 1) {
    candidate = resolve(backupRoot, `${baseName}-${index}`);
  }
  return candidate;
}

function assertSafeCodexConfigTarget(homeDir: string, targetPath: string): void {
  const resolvedHome = resolve(homeDir);
  const expectedDefault = resolve(resolvedHome, ".codex");
  const parsedTarget = parse(targetPath);
  if (targetPath === resolvedHome || targetPath === parsedTarget.root) {
    throw new Error(`拒绝清理危险路径：${targetPath}`);
  }
  if (targetPath !== expectedDefault && !isCodexConfigPathUnderHome(resolvedHome, targetPath)) {
    throw new Error(`ai:clean 只清理用户目录下的 Codex 配置：${expectedDefault}，当前目标：${targetPath}`);
  }
}

function isCodexConfigPathUnderHome(homeDir: string, targetPath: string): boolean {
  return targetPath.startsWith(`${homeDir}${sep}`) && basename(targetPath).toLowerCase().includes("codex");
}

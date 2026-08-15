#!/usr/bin/env bun

import { cp, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { openCodeEnvHasCompleteManagedBlock, removeOpenCodeEnvManagedBlock } from "../config/builders/env.ts";
import { argsFromArgv, parseBooleanOption, parseOptionValue } from "./args.ts";
import { GENERATED_CONFIG_HEADER, hasManagedLauncherHeader, hasManagedSkillMarker } from "./generation-plan.ts";
import { pathExists, StagedFileWriter } from "./fs.ts";
import { buildGeneratorPaths, type GeneratorPaths } from "./paths.ts";

export type CleanOptions = { backup: boolean | undefined };
export type CleanResult = { changed: string[]; backupPath?: string };

if (import.meta.main) {
  const paths = buildGeneratorPaths();
  const options = parseCleanOptions();
  const result = await cleanOpenCodeConfig(paths, { backup: await resolveBackupOption(options.backup) });
  console.log(
    result.changed.length > 0 ? `已清理 ${result.changed.length} 个 ai-share 受管目标。` : "没有可清理的受管目标。",
  );
  if (result.backupPath) console.log(`备份：${result.backupPath}`);
}

export function parseCleanOptions(argv: readonly string[] = Bun.argv): CleanOptions {
  const args = argsFromArgv(argv);
  const backupValue = parseOptionValue(args, "--backup", { missingValue: "true" });
  const noBackup = args.includes("--no-backup");
  if (backupValue !== undefined && noBackup) throw new Error("--backup 与 --no-backup 不能同时使用。");
  if (noBackup) return { backup: false };
  return { backup: backupValue === undefined ? undefined : parseBooleanOption("--backup", backupValue) };
}

export async function resolveBackupOption(value: boolean | undefined): Promise<boolean> {
  if (value !== undefined) return value;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;
  return await askYesNo("是否备份即将修改的 ai-share 受管文件？", true);
}

export async function cleanOpenCodeConfig(paths: GeneratorPaths, options: { backup: boolean }): Promise<CleanResult> {
  const deletes: string[] = [];
  const writes: { path: string; content: string }[] = [];

  if (await ownedTextFile(paths.targetOpenCodeConfig, GENERATED_CONFIG_HEADER))
    deletes.push(paths.targetOpenCodeConfig);
  if (await pathExists(paths.targetOpenCodeEnv)) {
    const stat = await lstat(paths.targetOpenCodeEnv);
    if (stat.isFile() && !stat.isSymbolicLink()) {
      const content = await readFile(paths.targetOpenCodeEnv, "utf8");
      if (openCodeEnvHasCompleteManagedBlock(content)) {
        const cleaned = removeOpenCodeEnvManagedBlock(content);
        if (cleaned.trim()) writes.push({ path: paths.targetOpenCodeEnv, content: cleaned });
        else deletes.push(paths.targetOpenCodeEnv);
      }
    }
  }
  deletes.push(...(await managedSkillDirs(paths.targetOpenCodeSkillsDir)));
  deletes.push(...(await managedSkillDirs(paths.targetGlobalSkillsDir)));
  for (const path of launcherPaths(paths)) {
    if (await ownedLauncherFile(path, paths)) deletes.push(path);
  }

  const changed = [...writes.map((entry) => entry.path), ...deletes];
  if (changed.length === 0) return { changed: [] };
  const backupPath = options.backup ? await backupTargets(paths, changed) : undefined;
  const writer = await StagedFileWriter.create(resolve(paths.targetOpenCodeConfigDir, ".ai-share-staging"));
  try {
    for (const entry of writes) await writer.writeText(entry.path, entry.content);
    for (const path of deletes) writer.delete(path);
    await writer.promote();
  } catch (error) {
    await writer.cleanup();
    throw error;
  }
  return backupPath ? { changed, backupPath } : { changed };
}

async function ownedTextFile(path: string, marker: string): Promise<boolean> {
  if (!(await pathExists(path))) return false;
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) return false;
  const content = await readFile(path, "utf8");
  return content.startsWith(marker);
}

async function ownedLauncherFile(path: string, paths: GeneratorPaths): Promise<boolean> {
  if (!(await pathExists(path))) return false;
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) return false;
  return hasManagedLauncherHeader(path, await readFile(path, "utf8"), paths);
}

async function managedSkillDirs(skillsDir: string): Promise<string[]> {
  if (!(await pathExists(skillsDir))) return [];
  const stat = await lstat(skillsDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return [];
  const output: string[] = [];
  for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(skillsDir, entry.name);
    if (await hasManagedSkillMarker(dir)) output.push(dir);
  }
  return output.sort();
}

async function backupTargets(paths: GeneratorPaths, targets: readonly string[]): Promise<string> {
  const backupRoot = resolve(
    paths.homeDir,
    ".opencode-backups",
    `ai-share-clean-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
  );
  await mkdir(backupRoot, { recursive: true });
  for (const target of targets) {
    if (!(await pathExists(target))) continue;
    const backupTarget = resolveBackupTarget(paths, backupRoot, target);
    await mkdir(dirname(backupTarget), { recursive: true });
    await cp(target, backupTarget, { recursive: true, errorOnExist: true, force: false });
  }
  return backupRoot;
}

function resolveBackupTarget(paths: GeneratorPaths, backupRoot: string, target: string): string {
  const configRelative = safeRelative(paths.targetOpenCodeConfigDir, target);
  if (configRelative !== undefined) return resolve(backupRoot, "opencode", configRelative);
  const binRelative = safeRelative(paths.targetUserBinDir, target);
  if (binRelative !== undefined) return resolve(backupRoot, "bin", binRelative);
  const globalSkillsRelative = safeRelative(paths.targetGlobalSkillsDir, target);
  if (globalSkillsRelative !== undefined) return resolve(backupRoot, "global-skills", globalSkillsRelative);
  throw new Error(`拒绝备份受管目录外路径：${target}`);
}

function safeRelative(parent: string, child: string): string | undefined {
  const rel = relative(resolve(parent), resolve(child));
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/)[0] === "..") return undefined;
  return rel;
}

function launcherPaths(paths: GeneratorPaths): string[] {
  return [paths.targetAiocScript, paths.targetAiocUnix, paths.targetAiocCmd, paths.targetAiocPowerShell];
}

async function askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  process.stdout.write(`${question} (${defaultValue ? "Y/n" : "y/N"}) `);
  const answer = await new Promise<string>((resolveAnswer) => {
    process.stdin.resume();
    process.stdin.once("data", (data) => resolveAnswer(data.toString("utf8").trim().toLowerCase()));
  });
  process.stdin.pause();
  if (!answer) return defaultValue;
  if (["y", "yes", "1", "true"].includes(answer)) return true;
  if (["n", "no", "0", "false"].includes(answer)) return false;
  return defaultValue;
}

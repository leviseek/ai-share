#!/usr/bin/env bun

import { cp, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { codexEnvHasCompleteManagedBlock, removeCodexEnvManagedBlock } from "../config/builders/env.ts";
import { argsFromArgv, parseBooleanOption, parseOptionValue } from "./args.ts";
import {
  GENERATED_CONFIG_HEADER,
  GENERATED_INSTRUCTIONS_MARKER,
  hasManagedSkillMarker,
  readLegacyOwnership,
} from "./generation-plan.ts";
import { pathExists, StagedFileWriter } from "./fs.ts";
import { buildGeneratorPaths, type GeneratorPaths } from "./paths.ts";

export type CleanOptions = { backup: boolean | undefined };
export type CleanResult = { changed: string[]; backupPath?: string };

if (import.meta.main) {
  const paths = buildGeneratorPaths();
  const options = parseCleanOptions();
  const result = await cleanCodexConfig(paths, { backup: await resolveBackupOption(options.backup) });
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

export async function cleanCodexConfig(paths: GeneratorPaths, options: { backup: boolean }): Promise<CleanResult> {
  const legacy = await readLegacyOwnership(paths);
  const deletes: string[] = [];
  const writes: { path: string; content: string }[] = [];

  if (await ownedTextFile(paths.targetCodexConfig, GENERATED_CONFIG_HEADER, legacy.configPath)) {
    deletes.push(paths.targetCodexConfig);
  }
  if (await ownedTextFile(paths.targetCodexInstructions, GENERATED_INSTRUCTIONS_MARKER)) {
    deletes.push(paths.targetCodexInstructions);
  }
  if (await pathExists(paths.targetCodexEnv)) {
    const content = await readFile(paths.targetCodexEnv, "utf8");
    if (codexEnvHasCompleteManagedBlock(content)) {
      const cleaned = removeCodexEnvManagedBlock(content);
      if (cleaned.trim()) writes.push({ path: paths.targetCodexEnv, content: cleaned });
      else deletes.push(paths.targetCodexEnv);
    }
  }
  deletes.push(...(await managedSkillDirs(paths, legacy.skills)));
  if (legacy.manifestPath) deletes.push(legacy.manifestPath);

  const changed = [...writes.map((entry) => entry.path), ...deletes];
  if (changed.length === 0) return { changed: [] };
  const backupPath = options.backup ? await backupTargets(paths, changed) : undefined;
  const writer = await StagedFileWriter.create(resolve(paths.targetCodexConfigDir, ".ai-share-staging"));
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

async function ownedTextFile(path: string, marker: string, legacyPath?: string): Promise<boolean> {
  if (!(await pathExists(path))) return false;
  if (legacyPath && resolve(legacyPath) === resolve(path)) return true;
  return (await readFile(path, "utf8")).startsWith(marker);
}

async function managedSkillDirs(paths: GeneratorPaths, legacySkills: ReadonlySet<string>): Promise<string[]> {
  if (!(await pathExists(paths.targetCodexSkillsDir))) return [];
  const output: string[] = [];
  for (const entry of await readdir(paths.targetCodexSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(paths.targetCodexSkillsDir, entry.name);
    if ((await hasManagedSkillMarker(dir)) || legacySkills.has(entry.name)) output.push(dir);
  }
  return output.sort();
}

async function backupTargets(paths: GeneratorPaths, targets: readonly string[]): Promise<string> {
  const backupRoot = resolve(
    paths.homeDir,
    ".codex-backups",
    `ai-share-clean-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
  );
  await mkdir(backupRoot, { recursive: true });
  for (const target of targets) {
    if (!(await pathExists(target))) continue;
    const rel = relative(paths.targetCodexConfigDir, target);
    if (!rel || isAbsolute(rel) || rel.split(/[\\/]/)[0] === "..") {
      throw new Error(`拒绝备份 CODEX_HOME 外路径：${target}`);
    }
    const backupTarget = resolve(backupRoot, rel);
    await mkdir(dirname(backupTarget), { recursive: true });
    await cp(target, backupTarget, { recursive: true, errorOnExist: true, force: false });
  }
  return backupRoot;
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

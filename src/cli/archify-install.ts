#!/usr/bin/env bun

import { lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadArchifyConfig, DEFAULT_ARCHIFY_CONFIG } from "../config/archify.ts";
import type { ArchifyYaml } from "../types.ts";
import { argsFromArgv } from "./args.ts";
import { ARCHIFY_REF_FILE, formatArchifyOwnershipRecord } from "./archify-ownership.ts";
import { SKILL_MANAGED_CONTENT, SKILL_MANAGED_MARKER } from "./generation-plan.ts";
import { buildGeneratorPaths, type GeneratorPaths } from "./paths.ts";

const DEFAULT_PROXY = "http://127.0.0.1:7897";
const PROXY_ENV_NAMES = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"] as const;

type ArchifyCommand = "install" | "update";

export type ArchifyInstallOptions = {
  command: ArchifyCommand;
  useProxy: boolean;
  force: boolean;
};

export type ArchifyCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type ArchifyCommandInvocation = {
  executable: "git" | "bun";
  args: readonly string[];
};

export type ArchifyInstallRunner = (
  invocation: ArchifyCommandInvocation,
  env: Record<string, string>,
) => ArchifyCommandResult;

export type ArchifyInstallRunResult =
  | {
      ok: true;
      options: ArchifyInstallOptions;
      config: ArchifyYaml;
      stdout: string;
      stderr: string;
      ownershipPath: string;
    }
  | { ok: false; error: unknown };

export function parseArchifyInstallOptions(argv: readonly string[] = Bun.argv): ArchifyInstallOptions {
  const args = argsFromArgv(argv);
  let command: ArchifyCommand | undefined;
  let proxyMode: "default" | "proxy" | "no-proxy" = "default";
  let force = false;
  for (const value of args) {
    if (value === "install" || value === "update") {
      if (command !== undefined) throw new Error(`重复命令：${value}`);
      command = value;
      continue;
    }
    if (value === "--proxy") {
      if (proxyMode !== "default") {
        throw new Error(proxyMode === "no-proxy" ? "--proxy 与 --no-proxy 不能同时使用" : "重复参数：--proxy");
      }
      proxyMode = "proxy";
      continue;
    }
    if (value === "--no-proxy") {
      if (proxyMode !== "default") {
        throw new Error(proxyMode === "proxy" ? "--proxy 与 --no-proxy 不能同时使用" : "重复参数：--no-proxy");
      }
      proxyMode = "no-proxy";
      continue;
    }
    if (value === "--force") {
      if (force) throw new Error("重复参数：--force");
      force = true;
      continue;
    }
    if (value.startsWith("--")) throw new Error(`未知参数：${value}`);
    throw new Error(`未知参数：${value}`);
  }
  return { command: command ?? "install", useProxy: proxyMode !== "no-proxy", force };
}

export function buildArchifyCommandPlan(
  sourceDir: string,
  config: ArchifyYaml = DEFAULT_ARCHIFY_CONFIG,
): ArchifyCommandInvocation[] {
  const repository = `https://github.com/${config.archify.repo}.git`;
  return [
    { executable: "git", args: ["init", "--quiet", sourceDir] },
    {
      executable: "git",
      args: ["-C", sourceDir, "fetch", "--depth", "1", repository, config.archify.ref],
    },
    { executable: "git", args: ["-C", sourceDir, "checkout", "--detach", "FETCH_HEAD", "--quiet"] },
    {
      executable: "bun",
      args: [
        "x",
        "skills",
        "add",
        sourceDir,
        "--skill",
        config.archify.skill,
        "--agent",
        "opencode",
        "--global",
        "--copy",
        "--yes",
      ],
    },
  ];
}

export async function runArchifyInstall(
  input: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    projectRoot?: string;
    config?: ArchifyYaml;
    runner?: ArchifyInstallRunner;
    persistOwnership?: boolean;
  } = {},
): Promise<ArchifyInstallRunResult> {
  try {
    const options = parseArchifyInstallOptions(input.argv ?? Bun.argv);
    const env = input.env ?? Bun.env;
    const projectRoot = input.projectRoot ?? resolve(import.meta.dir, "..", "..");
    const paths = input.projectRoot ? buildGeneratorPaths(projectRoot, env) : undefined;
    const config = input.config ?? (paths ? await loadArchifyConfig(paths.configDir) : DEFAULT_ARCHIFY_CONFIG);
    if (!config.archify.enabled) throw new Error("config/archify.yaml 已禁用 Archify。");
    if (paths) assertArchifyTargetOwnership(paths, config, options.force);
    const runner = input.runner ?? spawnArchifyCommand;
    const proxy = options.useProxy
      ? (env.HTTPS_PROXY ??
        env.HTTP_PROXY ??
        env.https_proxy ??
        env.http_proxy ??
        env.ALL_PROXY ??
        env.all_proxy ??
        DEFAULT_PROXY)
      : undefined;
    const runEnv: Record<string, string> = proxy ? { HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : {};
    const sourceDir = mkdtempSync(resolve(tmpdir(), "ai-share-archify-source-"));
    try {
      const stdout: string[] = [];
      const stderr: string[] = [];
      for (const invocation of buildArchifyCommandPlan(sourceDir, config)) {
        const result = runner(invocation, runEnv);
        if (trim(result.stdout)) stdout.push(trim(result.stdout));
        if (trim(result.stderr)) stderr.push(trim(result.stderr));
        if (result.status !== 0) {
          const detail =
            result.error?.message ??
            trimNonEmpty(result.stderr) ??
            trimNonEmpty(result.stdout) ??
            `exit ${result.status ?? "unknown"}`;
          const stage = `${invocation.executable} ${invocation.args[0] ?? ""}`.trim();
          throw new Error(`archify ${options.command} 执行失败（${stage}）：${detail}`, { cause: result.error });
        }
      }

      const shouldPersistOwnership = input.persistOwnership ?? input.projectRoot !== undefined;
      const ownershipPath = shouldPersistOwnership
        ? persistArchifyOwnership(paths ?? buildGeneratorPaths(projectRoot, env), config)
        : "";
      return {
        ok: true,
        options,
        config,
        stdout: stdout.join("\n"),
        stderr: stderr.join("\n"),
        ownershipPath,
      };
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
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
  const action = result.options.command === "update" ? "已更新" : "已安装";
  write(
    `archify ${action} 到本机 Skills CLI 全局目录；ownership 已记录到 ${result.ownershipPath}：\n${trim(result.stdout)}\n${trim(result.stderr)}`.trim(),
  );
  return 0;
}

function assertArchifyTargetOwnership(paths: GeneratorPaths, config: ArchifyYaml, force: boolean): void {
  const skillDir = resolve(paths.targetGlobalSkillsDir, config.archify.skill);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(skillDir);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Archify 目标不是可信普通目录：${skillDir}`);
  }
  const marker = readRegularFileIfExists(resolve(skillDir, SKILL_MANAGED_MARKER));
  const ownership = readOwnershipRecord(resolve(skillDir, ARCHIFY_REF_FILE));
  const expected = config.archify;
  const matches =
    marker === SKILL_MANAGED_CONTENT &&
    ownership?.repo === expected.repo &&
    ownership.skill === expected.skill &&
    ownership.ref === expected.ref;
  if (!matches && !force) {
    throw new Error(
      `Archify 目标未由当前配置管理，拒绝覆盖：${skillDir}\n请先备份并移除目标，或确认接管后使用 --force。`,
    );
  }
}

function readRegularFileIfExists(path: string): string | undefined {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return readFileSync(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function readOwnershipRecord(path: string): { repo: string; skill: string; ref: string } | undefined {
  const content = readRegularFileIfExists(path);
  if (!content) return undefined;
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.repo !== "string" || typeof record.skill !== "string" || typeof record.ref !== "string") {
      return undefined;
    }
    return { repo: record.repo, skill: record.skill, ref: record.ref };
  } catch {
    return undefined;
  }
}

function persistArchifyOwnership(paths: GeneratorPaths, config: ArchifyYaml): string {
  const skillDir = resolve(paths.targetGlobalSkillsDir, config.archify.skill);
  const skillFile = resolve(skillDir, "SKILL.md");
  const markerPath = resolve(skillDir, SKILL_MANAGED_MARKER);
  const refPath = resolve(skillDir, ARCHIFY_REF_FILE);
  ensureDirectory(skillDir);
  ensureRegularFile(skillFile, "Archify 安装后缺少 SKILL.md");
  writeAtomic(markerPath, SKILL_MANAGED_CONTENT);
  writeAtomic(
    refPath,
    formatArchifyOwnershipRecord({ repo: config.archify.repo, skill: config.archify.skill, ref: config.archify.ref }),
  );
  return refPath;
}

function ensureDirectory(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Archify skill 目录不是可信普通目录：${path}`);
  } catch (error) {
    if (isNotFound(error)) {
      mkdirSync(path, { recursive: true });
      return;
    }
    throw error;
  }
}

function ensureRegularFile(path: string, message: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${message}：${path}`);
  } catch (error) {
    if (isNotFound(error)) throw new Error(`${message}：${path}`, { cause: error });
    throw error;
  }
}

function writeAtomic(path: string, content: string): void {
  ensureParentDirectory(path);
  ensureWritableRegularFile(path);
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
}

function ensureParentDirectory(path: string): void {
  const parent = resolve(path, "..");
  mkdirSync(parent, { recursive: true });
}

function ensureWritableRegularFile(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`拒绝覆盖 Archify ownership 非普通文件：${path}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function trim(value: string): string {
  return value.trim();
}

function trimNonEmpty(value: string): string | undefined {
  const trimmed = trim(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

function spawnArchifyCommand(
  invocation: ArchifyCommandInvocation,
  proxyEnv: Record<string, string>,
): ArchifyCommandResult {
  const childEnv: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!(PROXY_ENV_NAMES as readonly string[]).includes(name)) childEnv[name] = value;
  }
  Object.assign(childEnv, proxyEnv);
  const result = spawnSync(invocation.executable, [...invocation.args], {
    encoding: "utf8",
    env: childEnv,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  };
}

if (import.meta.main) {
  process.exitCode = printArchifyInstallResult(
    await runArchifyInstall({
      projectRoot: resolve(import.meta.dir, "..", ".."),
      env: Bun.env,
      persistOwnership: true,
    }),
  );
}

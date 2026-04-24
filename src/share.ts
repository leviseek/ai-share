#!/usr/bin/env bun

import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readlink, rm, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type ShareMode = "link" | "copy";

type SharedConfig = {
  label: string;
  source: string;
  target: string;
  legacyTarget?: string;
};

const args = new Set(Bun.argv.slice(2));
const force = args.has("--force");
const mode: ShareMode = args.has("--copy") ? "copy" : "link";

const projectRoot = resolve(import.meta.dir, "..");
const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
const targetConfigDir = resolve(homeDir, ".config", "opencode");
const sharedConfigs: SharedConfig[] = [
  {
    label: "OpenCode 配置",
    source: resolve(projectRoot, "opencode.jsonc"),
    target: resolve(targetConfigDir, "opencode.jsonc"),
  },
  {
    label: "oh-my-openagent 配置",
    source: resolve(projectRoot, ".opencode", "oh-my-openagent.jsonc"),
    target: resolve(targetConfigDir, "oh-my-openagent.jsonc"),
    legacyTarget: resolve(targetConfigDir, "oh-my-openagent.json"),
  },
];

if (!targetConfigDir.startsWith(homeDir)) {
  throw new Error("无法解析 OpenCode 配置目录所需的用户主目录。");
}

await mkdir(targetConfigDir, { recursive: true });

for (const config of sharedConfigs) {
  await ensureReadable(config.source);
  const effectiveMode = await installConfig(config.source, config.target, mode, force, config.label);
  await warnLegacyConfig(config);

  console.log(`已共享 ${config.label}：${config.target}`);
  console.log(`来源：${config.source}`);
  console.log(`模式：${formatMode(effectiveMode)}`);
}

async function warnLegacyConfig(config: SharedConfig): Promise<void> {
  if (!config.legacyTarget) return;
  if (!(await pathExists(config.legacyTarget))) return;

  console.warn(`检测到旧版 ${config.label}：${config.legacyTarget}`);
  console.warn(`${config.target} 通常会优先，但同时保留两个文件会增加排查成本。`);
  console.warn("确认 .jsonc 配置生效后，建议手动备份或移除旧 .json 文件。");
}

async function ensureReadable(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`缺少可读取的配置文件：${path}`);
  }
}

async function installConfig(
  source: string,
  target: string,
  requestedMode: ShareMode,
  overwrite: boolean,
  label: string,
): Promise<ShareMode | "already-linked" | "already-copied"> {
  const existing = await getExistingTarget(target);

  if (existing) {
    if (existing.linkTarget && resolve(dirname(target), existing.linkTarget) === source) {
      console.log(`${label} 已链接到当前仓库。`);
      return "already-linked";
    }

    if (!existing.linkTarget && (await hasSameContent(source, target))) {
      console.log(`${label} 已是当前仓库配置的副本。`);
      return "already-copied";
    }

    if (!overwrite) {
      throw new Error(
        `目标已存在：${target}\n` +
          "运行 `bun run share -- --force` 覆盖它，或运行 `bun run share -- --copy --force` 改用复制模式。",
      );
    }

    await rm(target, { force: true });
  }

  if (requestedMode === "copy") {
    await copyFile(source, target);
    return "copy";
  }

  try {
    await symlink(source, target, "file");
    return "link";
  } catch (error) {
    console.warn(`无法为 ${label} 创建符号链接：${formatError(error)}`);
    printSymlinkHelp();

    if (isInteractive() && !confirmYes("是否改为复制该配置？", true)) {
      throw new Error(`已跳过 ${label}。请授予符号链接权限后重试，或使用复制模式。`, { cause: error });
    }

    if (!isInteractive()) {
      console.warn("检测到非交互式终端，自动改用复制模式。");
    }

    await copyFile(source, target);
    return "copy";
  }
}

async function hasSameContent(left: string, right: string): Promise<boolean> {
  try {
    const [leftContent, rightContent] = await Promise.all([readFile(left, "utf8"), readFile(right, "utf8")]);
    return leftContent === rightContent;
  } catch {
    return false;
  }
}

async function getExistingTarget(path: string): Promise<{ linkTarget?: string } | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) return {};
    return { linkTarget: await readlink(path) };
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatMode(mode: ShareMode | "already-linked" | "already-copied"): string {
  if (mode === "link") return "符号链接";
  if (mode === "copy") return "复制";
  if (mode === "already-linked") return "已链接";
  return "已复制";
}

function printSymlinkHelp(): void {
  if (process.platform !== "win32") return;

  console.warn("Windows 创建配置符号链接需要符号链接权限。");
  console.warn("如需使用链接模式，请以管理员身份运行终端，或在 Windows 设置中启用开发者模式。");
  console.warn("如果不需要随仓库实时更新，复制模式是安全选择：`bun run share -- --copy --force`。");
}

function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function confirmYes(label: string, defaultValue: boolean): boolean {
  const suffix = defaultValue ? " [Y/n]" : " [y/N]";
  const answer = prompt(`${label}${suffix}:`)?.trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes";
}

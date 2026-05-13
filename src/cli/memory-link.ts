import { mkdir, realpath, symlink, lstat } from "node:fs/promises";
import { dirname } from "node:path";
import type { GeneratorPaths } from "./paths.ts";

export async function ensureAiWorkspaceLinks(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  await ensureAiWorkspaceDir(paths, dryRun);
  await ensureAiShareWorkspaceLink(paths, dryRun);
  await ensureAiMemoryWorkspaceLink(paths, dryRun);
}

async function ensureAiWorkspaceDir(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const workspaceStats = await pathStats(paths.aiWorkspaceDir);
  if (workspaceStats?.isDirectory()) return;

  if (workspaceStats) {
    console.warn(`AI 工作区路径已存在但不是目录：${paths.aiWorkspaceDir}。未覆盖，请手动确认后调整该路径。`);
    return;
  }

  if (dryRun) {
    console.log(`将创建 AI 工作区目录：${paths.aiWorkspaceDir}`);
    return;
  }

  try {
    await mkdir(paths.aiWorkspaceDir, { recursive: true });
    console.log(`已创建 AI 工作区目录：${paths.aiWorkspaceDir}`);
  } catch (error) {
    console.warn(`创建 AI 工作区目录失败：${paths.aiWorkspaceDir}。将继续生成配置。原因：${formatError(error)}`);
  }
}

async function ensureAiShareWorkspaceLink(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const sourcePath = paths.projectRoot;
  const targetPath = paths.workspaceAiShareDir;

  if (samePath(sourcePath, targetPath)) return;

  const targetStats = await pathStats(targetPath);
  if (targetStats) {
    const [sourceRealPath, targetRealPath] = await Promise.all([safeRealpath(sourcePath), safeRealpath(targetPath)]);
    if (sourceRealPath && targetRealPath && samePath(sourceRealPath, targetRealPath)) return;

    console.warn(`ai-share 工作区路径已存在：${targetPath}。未覆盖；如需重定向，请手动确认后调整该路径。`);
    return;
  }

  if (dryRun) {
    console.log(`将创建 ai-share 目录链接：${targetPath} -> ${sourcePath}`);
    return;
  }

  await createDirectoryLink("ai-share", sourcePath, targetPath);
}

export async function ensureAiMemoryWorkspaceLink(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const sourcePath = paths.externalAiMemoryDir;
  const targetPath = paths.workspaceAiMemoryDir;

  if (samePath(sourcePath, targetPath)) {
    const sourceStats = await pathStats(sourcePath);
    if (!sourceStats?.isDirectory()) {
      console.warn(`未找到 ai-memory 仓库：${sourcePath}。将跳过外部记忆导入，不影响配置生成。`);
    }
    return;
  }

  const sourceStats = await pathStats(sourcePath);
  if (!sourceStats?.isDirectory()) {
    console.warn(`未找到 ai-memory 仓库：${sourcePath}。将跳过外部记忆导入，不影响配置生成。`);
    return;
  }

  const targetStats = await pathStats(targetPath);
  if (targetStats) {
    const [sourceRealPath, targetRealPath] = await Promise.all([safeRealpath(sourcePath), safeRealpath(targetPath)]);
    if (sourceRealPath && targetRealPath && samePath(sourceRealPath, targetRealPath)) return;

    console.warn(
      `ai-memory 工作区路径已存在：${targetPath}。未覆盖；如需重定向到 ${sourcePath}，请手动确认后调整该路径。`,
    );
    return;
  }

  if (dryRun) {
    console.log(`将创建 ai-memory 目录链接：${targetPath} -> ${sourcePath}`);
    return;
  }

  await createDirectoryLink("ai-memory", sourcePath, targetPath);
}

async function createDirectoryLink(label: string, sourcePath: string, targetPath: string): Promise<void> {
  try {
    await mkdir(dirname(targetPath), { recursive: true });
    await symlink(sourcePath, targetPath, "dir");
    console.log(`已创建 ${label} 目录链接：${targetPath} -> ${sourcePath}`);
  } catch (error) {
    console.warn(
      `创建 ${label} 目录链接失败：${targetPath} -> ${sourcePath}。将继续生成配置；请检查权限、Developer Mode 或手动创建链接。原因：${formatError(error)}`,
    );
  }
}

async function pathStats(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function safeRealpath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

function samePath(left: string, right: string): boolean {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

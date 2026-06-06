import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { color } from "./color.ts";

export async function writeJson(
  path: string,
  value: unknown,
  options: { dryRun: boolean; force: boolean },
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeText(path, content, options);
}

export async function writeText(
  path: string,
  content: string,
  options: { dryRun: boolean; force: boolean },
): Promise<void> {
  if (options.dryRun) {
    console.log(`\n${color.gray("---")} ${color.cyan(path)} ${color.gray("---")}\n${content}`);
    return;
  }

  if (!options.force && (await pathExists(path))) {
    throw new Error(`目标已存在：${path}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await atomicWriteFile(path, content);
}

export async function pathExists(path: string): Promise<boolean> {
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

export async function atomicWriteFile(
  path: string,
  content: string | Uint8Array,
  options: { mode?: number } = {},
): Promise<void> {
  const targetPath = resolve(path);
  const tempPath = resolve(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, content, options.mode === undefined ? undefined : { mode: options.mode });
    if (options.mode !== undefined) await chmod(tempPath, options.mode);
    await rename(tempPath, targetPath);
  } catch (error) {
    await removeTempFile(tempPath);
    throw error;
  }
}

async function removeTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

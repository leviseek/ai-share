import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { color } from "./color.ts";

export async function writeJson(
  path: string,
  value: unknown,
  options: { dryRun: boolean; force: boolean },
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (options.dryRun) {
    console.log(`\n${color.gray("---")} ${color.cyan(path)} ${color.gray("---")}\n${content}`);
    return;
  }

  if (!options.force && (await pathExists(path))) {
    throw new Error(`目标已存在：${path}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await writeFile(path, content);
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

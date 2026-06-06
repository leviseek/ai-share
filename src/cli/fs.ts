import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { color } from "./color.ts";

type StagedFile = {
  targetPath: string;
  stagedPath: string;
  backupPath: string;
  promoted: boolean;
  hadExisting: boolean;
};

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

export class StagedFileWriter {
  readonly stagingRoot: string;
  readonly stagingDir: string;
  readonly backupDir: string;

  private readonly files: StagedFile[] = [];
  private promoted = false;

  private constructor(stagingRoot: string, stagingDir: string) {
    this.stagingRoot = stagingRoot;
    this.stagingDir = stagingDir;
    this.backupDir = resolve(stagingDir, "backups");
  }

  static async create(stagingRoot: string): Promise<StagedFileWriter> {
    const resolvedStagingRoot = resolve(stagingRoot);
    const stagingDir = resolve(resolvedStagingRoot, `${process.pid}-${randomUUID()}`);
    await mkdir(resolve(stagingDir, "files"), { recursive: true });
    await mkdir(resolve(stagingDir, "backups"), { recursive: true });
    return new StagedFileWriter(resolvedStagingRoot, stagingDir);
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.stage(path, content);
  }

  async writeJson(path: string, value: unknown): Promise<void> {
    await this.stage(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  async promote(): Promise<void> {
    try {
      for (const file of this.files) {
        await mkdir(dirname(file.targetPath), { recursive: true });
        file.hadExisting = await pathExists(file.targetPath);
        if (file.hadExisting) await rename(file.targetPath, file.backupPath);
        await rename(file.stagedPath, file.targetPath);
        file.promoted = true;
      }
      this.promoted = true;
    } catch (error) {
      await this.rollback();
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async cleanup(): Promise<void> {
    await rm(this.stagingDir, { recursive: true, force: true });
    await removeEmptyDirectory(this.stagingRoot);
  }

  private async stage(path: string, content: string | Uint8Array): Promise<void> {
    if (this.promoted) throw new Error("staged writer 已提交，不能继续写入。");

    const targetPath = resolve(path);
    if (this.files.some((file) => file.targetPath === targetPath)) {
      throw new Error(`staged writer 重复目标路径：${targetPath}`);
    }
    const stagedPath = resolve(this.stagingDir, "files", `${this.files.length}-${basename(targetPath)}`);
    const backupPath = resolve(this.backupDir, `${this.files.length}-${basename(targetPath)}`);
    await writeFile(stagedPath, content);
    this.files.push({
      targetPath,
      stagedPath,
      backupPath,
      promoted: false,
      hadExisting: false,
    });
  }

  private async rollback(): Promise<void> {
    for (const file of [...this.files].reverse()) {
      if (file.promoted && (await pathExists(file.targetPath))) {
        await unlink(file.targetPath);
      }
      if (file.hadExisting && (await pathExists(file.backupPath))) {
        await mkdir(dirname(file.targetPath), { recursive: true });
        await rename(file.backupPath, file.targetPath);
      }
    }
  }
}

async function removeTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch (error) {
    if (!isNotFound(error) && !isDirectoryNotEmpty(error)) throw error;
  }
}

function isDirectoryNotEmpty(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOTEMPTY";
}

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

type StagedEntry = {
  kind: "write" | "delete";
  targetPath: string;
  stagedPath?: string;
  backupPath: string;
  promoted: boolean;
  hadExisting: boolean;
};

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

export class StagedFileWriter {
  readonly stagingRoot: string;
  readonly stagingDir: string;
  readonly backupDir: string;

  private readonly entries: StagedEntry[] = [];
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

  delete(path: string): void {
    this.assertCanStage(path);
    const targetPath = resolve(path);
    this.entries.push({
      kind: "delete",
      targetPath,
      backupPath: resolve(this.backupDir, `${this.entries.length}-${basename(targetPath)}`),
      promoted: false,
      hadExisting: false,
    });
  }

  async promote(): Promise<void> {
    try {
      for (const entry of this.entries) {
        await mkdir(dirname(entry.targetPath), { recursive: true });
        entry.hadExisting = await pathExists(entry.targetPath);
        if (entry.hadExisting) await rename(entry.targetPath, entry.backupPath);
        if (entry.kind === "write") {
          const stagedPath = entry.stagedPath;
          if (!stagedPath) throw new Error(`staged writer 缺少临时文件：${entry.targetPath}`);
          await rename(stagedPath, entry.targetPath);
        }
        entry.promoted = true;
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

    this.assertCanStage(path);
    const targetPath = resolve(path);
    const stagedPath = resolve(this.stagingDir, "files", `${this.entries.length}-${basename(targetPath)}`);
    const backupPath = resolve(this.backupDir, `${this.entries.length}-${basename(targetPath)}`);
    await writeFile(stagedPath, content);
    this.entries.push({
      kind: "write",
      targetPath,
      stagedPath,
      backupPath,
      promoted: false,
      hadExisting: false,
    });
  }

  private assertCanStage(path: string): void {
    if (this.promoted) throw new Error("staged writer 已提交，不能继续写入。");
    const targetPath = resolve(path);
    if (this.entries.some((entry) => entry.targetPath === targetPath)) {
      throw new Error(`staged writer 重复目标路径：${targetPath}`);
    }
  }

  private async rollback(): Promise<void> {
    for (const entry of [...this.entries].reverse()) {
      if (entry.promoted && (await pathExists(entry.targetPath))) {
        await rm(entry.targetPath, { recursive: true, force: true });
      }
      if (entry.hadExisting && (await pathExists(entry.backupPath))) {
        await mkdir(dirname(entry.targetPath), { recursive: true });
        await rename(entry.backupPath, entry.targetPath);
      }
    }
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

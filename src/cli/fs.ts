import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, parse, resolve } from "node:path";

type StagedEntry = {
  kind: "write" | "delete";
  targetPath: string;
  stagedPath?: string;
  backupPath?: string;
  promoted: boolean;
  hadExisting: boolean;
};

export type StagedFileWriterOptions = {
  rename?: (source: string, target: string) => Promise<void>;
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

  private readonly entries: StagedEntry[] = [];
  private readonly targetStagingDirs = new Set<string>();
  private readonly transactionId: string;
  private readonly renamePath: (source: string, target: string) => Promise<void>;
  private promoted = false;
  private recoveryRequired = false;

  private constructor(
    stagingRoot: string,
    stagingDir: string,
    transactionId: string,
    options: StagedFileWriterOptions,
  ) {
    this.stagingRoot = stagingRoot;
    this.stagingDir = stagingDir;
    this.transactionId = transactionId;
    this.renamePath = options.rename ?? rename;
  }

  static async create(stagingRoot: string, options: StagedFileWriterOptions = {}): Promise<StagedFileWriter> {
    const resolvedStagingRoot = resolve(stagingRoot);
    const transactionId = `${process.pid}-${randomUUID()}`;
    const stagingDir = resolve(resolvedStagingRoot, transactionId);
    await mkdir(stagingDir, { recursive: true });
    return new StagedFileWriter(resolvedStagingRoot, stagingDir, transactionId, options);
  }

  async writeText(path: string, content: string, mode?: number): Promise<void> {
    await this.stage(path, content, mode);
  }

  delete(path: string): void {
    this.assertCanStage(path);
    const targetPath = resolve(path);
    this.entries.push({
      kind: "delete",
      targetPath,
      promoted: false,
      hadExisting: false,
    });
  }

  async promote(): Promise<void> {
    try {
      for (const entry of this.entries) {
        await mkdir(dirname(entry.targetPath), { recursive: true });
        entry.hadExisting = await pathExists(entry.targetPath);
        const backupPath = await this.ensureBackupPath(entry);
        if (entry.hadExisting) await this.renamePath(entry.targetPath, backupPath);
        if (entry.kind === "write") {
          const stagedPath = entry.stagedPath;
          if (!stagedPath) throw new Error(`staged writer 缺少临时文件：${entry.targetPath}`);
          await this.renamePath(stagedPath, entry.targetPath);
        }
        entry.promoted = true;
      }
      this.promoted = true;
    } catch (error) {
      try {
        await this.rollback();
      } catch (rollbackError) {
        this.recoveryRequired = true;
        throw new AggregateError(
          [error, rollbackError],
          `staged writer 提交失败且回滚失败；恢复文件保留在：${this.recoveryPaths().join(", ")}`,
          { cause: rollbackError },
        );
      }
      await this.cleanup();
      throw error;
    }
    await this.cleanup();
  }

  async cleanup(): Promise<void> {
    if (this.recoveryRequired) return;
    for (const targetStagingDir of this.targetStagingDirs) {
      await rm(targetStagingDir, { recursive: true, force: true });
    }
    await rm(this.stagingDir, { recursive: true, force: true });
    await removeEmptyDirectory(this.stagingRoot);
  }

  private async stage(path: string, content: string | Uint8Array, mode?: number): Promise<void> {
    if (this.promoted) throw new Error("staged writer 已提交，不能继续写入。");

    this.assertCanStage(path);
    const targetPath = resolve(path);
    const targetStagingDir = await this.ensureTargetStagingDir(targetPath);
    const stagedPath = resolve(targetStagingDir, "files", `${this.entries.length}-${basename(targetPath)}`);
    const backupPath = resolve(targetStagingDir, "backups", `${this.entries.length}-${basename(targetPath)}`);
    await writeFile(stagedPath, content, mode === undefined ? undefined : { mode });
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
    const errors: unknown[] = [];
    for (const entry of [...this.entries].reverse()) {
      try {
        if (entry.promoted && (await pathExists(entry.targetPath))) {
          await rm(entry.targetPath, { recursive: true, force: true });
        }
        const backupPath = entry.backupPath;
        if (entry.hadExisting && backupPath && (await pathExists(backupPath))) {
          await mkdir(dirname(entry.targetPath), { recursive: true });
          await this.renamePath(backupPath, entry.targetPath);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "staged writer 回滚失败");
  }

  private async ensureBackupPath(entry: StagedEntry): Promise<string> {
    if (entry.backupPath) return entry.backupPath;
    const targetStagingDir = await this.ensureTargetStagingDir(entry.targetPath);
    const backupPath = resolve(
      targetStagingDir,
      "backups",
      `${this.entries.indexOf(entry)}-${basename(entry.targetPath)}`,
    );
    entry.backupPath = backupPath;
    return backupPath;
  }

  private async ensureTargetStagingDir(targetPath: string): Promise<string> {
    const ancestor = await nearestExistingDirectory(dirname(targetPath));
    const targetStagingDir = resolve(ancestor, `.ai-share-staging-${this.transactionId}`);
    if (!this.targetStagingDirs.has(targetStagingDir)) {
      await mkdir(resolve(targetStagingDir, "files"), { recursive: true });
      await mkdir(resolve(targetStagingDir, "backups"), { recursive: true });
      this.targetStagingDirs.add(targetStagingDir);
    }
    return targetStagingDir;
  }

  private recoveryPaths(): string[] {
    return [this.stagingDir, ...this.targetStagingDirs];
  }
}

async function nearestExistingDirectory(path: string): Promise<string> {
  let candidate = resolve(path);
  while (true) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    const parent = dirname(candidate);
    if (parent === candidate || candidate === parse(candidate).root) {
      throw new Error(`无法找到目标路径所在文件系统的现有目录：${path}`);
    }
    candidate = parent;
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

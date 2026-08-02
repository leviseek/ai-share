import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { StagedFileWriter } from "./fs.ts";

describe("StagedFileWriter", () => {
  test("rolls back staged promote failures and cleans staging files", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-"));
    try {
      const existingPath = join(root, "config.toml");
      const blockingPath = join(root, "not-dir");
      const stagingRoot = join(root, ".staging");
      writeFileSync(existingPath, "old\n");
      writeFileSync(blockingPath, "file\n");

      const writer = await StagedFileWriter.create(stagingRoot);
      await writer.writeText(existingPath, "new\n");
      await writer.writeText(join(blockingPath, "nested.toml"), "cannot promote\n");

      const error = await captureError(writer.promote());
      expect(error).toBeInstanceOf(Error);
      expect(readFileSync(existingPath, "utf8")).toBe("old\n");
      expect(readFileSync(blockingPath, "utf8")).toBe("file\n");
      expect(existsSync(writer.stagingDir)).toBe(false);
      expect(existsSync(stagingRoot)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("restores staged deletions when a later promote fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-delete-"));
    try {
      const deletedPath = join(root, "stale-skill");
      const blockingPath = join(root, "not-dir");
      const stagingRoot = join(root, ".staging");
      writeFileSync(deletedPath, "keep on rollback\n");
      writeFileSync(blockingPath, "file\n");

      const writer = await StagedFileWriter.create(stagingRoot);
      writer.delete(deletedPath);
      await writer.writeText(join(blockingPath, "nested.toml"), "cannot promote\n");

      const error = await captureError(writer.promote());
      expect(error).toBeInstanceOf(Error);
      expect(readFileSync(deletedPath, "utf8")).toBe("keep on rollback\n");
      expect(readFileSync(blockingPath, "utf8")).toBe("file\n");
      expect(existsSync(stagingRoot)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("restores a deleted parent after staged descendant writes roll back", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-parent-delete-"));
    try {
      const replacedPath = join(root, "managed-skill");
      const blockingPath = join(root, "not-dir");
      const stagingRoot = join(root, ".staging");
      writeFileSync(replacedPath, "original non-directory target\n");
      writeFileSync(blockingPath, "file\n");

      const writer = await StagedFileWriter.create(stagingRoot);
      writer.delete(replacedPath);
      await writer.writeText(join(replacedPath, "SKILL.md"), "replacement\n");
      await writer.writeText(join(blockingPath, "nested.toml"), "cannot promote\n");

      const error = await captureError(writer.promote());
      expect(error).toBeInstanceOf(Error);
      expect(readFileSync(replacedPath, "utf8")).toBe("original non-directory target\n");
      expect(existsSync(stagingRoot)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects duplicate staged target paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-"));
    try {
      const writer = await StagedFileWriter.create(join(root, ".staging"));
      const targetPath = join(root, "config.toml");
      await writer.writeText(targetPath, "first\n");

      const error = await captureError(writer.writeText(targetPath, "second\n"));
      expect(String(error)).toContain("重复目标路径");
      await writer.cleanup();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("stages each target on the same simulated volume before promotion", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-volumes-"));
    try {
      const configVolume = join(root, "config-volume");
      const homeVolume = join(root, "home-volume");
      mkdirSync(configVolume, { recursive: true });
      mkdirSync(homeVolume, { recursive: true });
      const observedRenames: [string, string][] = [];
      const writer = await StagedFileWriter.create(join(configVolume, ".staging"), {
        rename: async (source, target) => {
          observedRenames.push([source, target]);
          if (simulatedVolume(configVolume, homeVolume, source) !== simulatedVolume(configVolume, homeVolume, target)) {
            throw Object.assign(new Error("simulated cross-volume rename"), { code: "EXDEV" });
          }
          await rename(source, target);
        },
      });
      const configTarget = join(configVolume, "opencode.jsonc");
      const launcherTarget = join(homeVolume, "aioc");
      await writer.writeText(configTarget, "config\n");
      await writer.writeText(launcherTarget, "launcher\n");

      await writer.promote();

      expect(readFileSync(configTarget, "utf8")).toBe("config\n");
      expect(readFileSync(launcherTarget, "utf8")).toBe("launcher\n");
      expect(observedRenames.length).toBeGreaterThan(0);
      expect(
        observedRenames.every(
          ([source, target]) =>
            simulatedVolume(configVolume, homeVolume, source) === simulatedVolume(configVolume, homeVolume, target),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("preserves recovery files when rollback cannot restore a backup", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-recovery-"));
    try {
      const existingPath = join(root, "config.jsonc");
      const blockingPath = join(root, "not-dir");
      writeFileSync(existingPath, "old\n");
      writeFileSync(blockingPath, "file\n");
      const writer = await StagedFileWriter.create(join(root, ".staging"), {
        rename: async (source, target) => {
          if (source.split(/[\\/]/).includes("backups") && target === existingPath) {
            throw new Error("simulated restore failure");
          }
          await rename(source, target);
        },
      });
      await writer.writeText(existingPath, "new\n");
      await writer.writeText(join(blockingPath, "nested.jsonc"), "cannot promote\n");

      const error = await captureError(writer.promote());

      expect(error).toBeInstanceOf(AggregateError);
      expect(String(error)).toContain("回滚失败");
      expect(existsSync(writer.stagingDir)).toBe(true);
      expect(readAllFileContents(root)).toContain("old\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

function simulatedVolume(configVolume: string, homeVolume: string, path: string): string {
  const rel = relative(configVolume, path);
  if (!rel.startsWith(`..${sep}`) && rel !== "..") return "config";
  const homeRel = relative(homeVolume, path);
  if (!homeRel.startsWith(`..${sep}`) && homeRel !== "..") return "home";
  return "outside";
}

function readAllFileContents(root: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...readAllFileContents(path));
    else if (entry.isFile()) output.push(readFileSync(path, "utf8"));
  }
  return output;
}

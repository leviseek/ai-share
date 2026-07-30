import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

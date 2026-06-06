import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile, StagedFileWriter, writeJson, writeText } from "./fs.ts";

describe("writeText/writeJson", () => {
  test("preserves existing files when force is false", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-"));
    try {
      const path = join(root, "config.toml");
      writeFileSync(path, "old\n");

      let error: unknown;
      try {
        await writeText(path, "new\n", { dryRun: false, force: false });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("目标已存在");
      expect(readFileSync(path, "utf8")).toBe("old\n");
      expect(readdirSync(root)).toEqual(["config.toml"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("replaces files atomically when force is true", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-"));
    try {
      const path = join(root, "config.toml");
      writeFileSync(path, "old\n");

      await writeText(path, "new\n", { dryRun: false, force: true });

      expect(readFileSync(path, "utf8")).toBe("new\n");
      expect(readdirSync(root)).toEqual(["config.toml"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writes formatted JSON through the same file path", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-"));
    try {
      const path = join(root, "manifest.json");

      await writeJson(path, { stack: "codex+omx" }, { dryRun: false, force: false });

      expect(readFileSync(path, "utf8")).toBe(`{\n  "stack": "codex+omx"\n}\n`);
      expect(readdirSync(root)).toEqual(["manifest.json"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writes binary content through the same atomic path", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-fs-"));
    try {
      const path = join(root, "launcher.bin");

      await atomicWriteFile(path, new Uint8Array([0, 1, 2, 255]));

      expect(Array.from(readFileSync(path))).toEqual([0, 1, 2, 255]);
      expect(readdirSync(root)).toEqual(["launcher.bin"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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

      let error: unknown;
      try {
        await writer.promote();
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect(readFileSync(existingPath, "utf8")).toBe("old\n");
      expect(readFileSync(blockingPath, "utf8")).toBe("file\n");
      expect(existsSync(writer.stagingDir)).toBe(false);
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

      let error: unknown;
      try {
        await writer.writeText(targetPath, "second\n");
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("重复目标路径");
      await writer.cleanup();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

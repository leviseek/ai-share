import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeJson, writeText } from "./fs.ts";

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
});

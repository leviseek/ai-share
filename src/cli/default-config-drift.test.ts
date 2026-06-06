import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDefaultConfigDrift } from "./default-config-drift.ts";

describe("detectDefaultConfigDrift", () => {
  test("reports missing default config", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-drift-"));
    try {
      const path = join(root, "config.toml");

      expect(await detectDefaultConfigDrift(path, 'model = "gpt"\n')).toEqual({
        status: "missing",
        path,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("treats line ending and trailing newline differences as current", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-drift-"));
    try {
      const path = join(root, "config.toml");
      writeFileSync(path, 'model = "gpt"\r\n');

      expect(await detectDefaultConfigDrift(path, 'model = "gpt"\n\n')).toEqual({
        status: "current",
        path,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports drifted default config", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-drift-"));
    try {
      const path = join(root, "config.toml");
      writeFileSync(path, 'model = "old"\n');

      expect(await detectDefaultConfigDrift(path, 'model = "new"\n')).toEqual({
        status: "drifted",
        path,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

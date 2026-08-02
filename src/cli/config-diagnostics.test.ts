import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { launcherFilesAreCurrent } from "./config-diagnostics.ts";

describe("launcher diagnostics", () => {
  test("requires every expected launcher file to match", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-launcher-diagnostic-"));
    try {
      const expected = { [join(root, "aioc.ts")]: "script\n", [join(root, "aioc.cmd")]: "cmd\n" };
      expect(await launcherFilesAreCurrent(expected)).toBe(false);
      for (const [path, content] of Object.entries(expected)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf8");
      }
      expect(await launcherFilesAreCurrent(expected)).toBe(true);
      writeFileSync(join(root, "aioc.cmd"), "drift\n", "utf8");
      expect(await launcherFilesAreCurrent(expected)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports a non-executable Unix launcher as drifted", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-launcher-mode-"));
    try {
      const unixPath = join(root, "aioc");
      const content = "#!/bin/sh\n";
      const expected = { [unixPath]: content };
      writeFileSync(unixPath, content, "utf8");

      expect(await launcherFilesAreCurrent(expected, unixPath, "linux")).toBe(false);
      expect(await launcherFilesAreCurrent(expected, unixPath, "win32")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

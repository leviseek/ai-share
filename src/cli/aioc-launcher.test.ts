import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildAiocEnvironment, runAioc } from "../../bin/aioc.ts";

describe("aioc launcher", () => {
  test("loads only the managed block and preserves existing environment values", () => {
    const content = [
      "PRIVATE_FLAG=ignored",
      "# BEGIN ai-share managed env",
      "HTTP_PROXY=http://127.0.0.1:7897",
      'QUOTED="value with spaces"',
      "# END ai-share managed env",
      "AFTER_FLAG=ignored",
      "",
    ].join("\n");
    expect(buildAiocEnvironment({ HTTP_PROXY: "http://shell:8080", KEEP: "yes" }, content)).toEqual({
      HTTP_PROXY: "http://shell:8080",
      KEEP: "yes",
      QUOTED: "value with spaces",
    });
  });

  test("treats Windows environment names as case-insensitive when preserving shell values", () => {
    const content = [
      "# BEGIN ai-share managed env",
      "HTTP_PROXY=http://managed:7897",
      "# END ai-share managed env",
      "",
    ].join("\n");

    expect(buildAiocEnvironment({ http_proxy: "http://shell:8080" }, content, "win32")).toEqual({
      http_proxy: "http://shell:8080",
    });
  });

  test("forwards arguments and the merged environment to a real child process and returns its exit code", () => {
    const root = mkdtempSync(join(tmpdir(), "aioc-launcher-"));
    try {
      const script = join(root, "probe.ts");
      write(
        script,
        "console.log(JSON.stringify({ argv: Bun.argv.slice(2), value: Bun.env.AIOC_TEST_VALUE })); process.exit(7);\n",
      );
      const result = runAioc(
        [script, "one", "two words"],
        { ...process.env, AIOC_TEST_VALUE: "ready" },
        process.execPath,
        "pipe",
      );
      expect(result.exitCode).toBe(7);
      expect(JSON.parse(result.stdout)).toEqual({ argv: ["one", "two words"], value: "ready" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

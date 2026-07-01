import { describe, expect, test } from "bun:test";
import { contentHash, normalizePath, objectId, stableAnchor } from "../core/ids.ts";

describe("RIE core ids", () => {
  test("normalizes Windows paths", () => {
    expect(normalizePath("src\\knowledge\\cli.ts")).toBe("src/knowledge/cli.ts");
  });

  test("builds stable object ids", () => {
    expect(objectId("doc", "README.md", stableAnchor("Hello World!"))).toBe("doc:README.md#hello-world");
  });

  test("hash changes with content", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

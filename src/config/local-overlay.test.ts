import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listLocalConfigOverlays, loadConfigYaml, mergeLocalOverlay } from "./local-overlay.ts";
import { parseYamlObject } from "../yaml.ts";

describe("local config overlay", () => {
  test("deep merges objects and replaces arrays/scalars", () => {
    expect(mergeLocalOverlay({ a: { b: 1, c: [1] }, d: true }, { a: { c: [2], e: 3 }, d: false })).toEqual({
      a: { b: 1, c: [2], e: 3 },
      d: false,
    });
  });

  test("loads standard YAML including object arrays", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-overlay-"));
    try {
      mkdirSync(join(root, "local"), { recursive: true });
      writeFileSync(join(root, "sample.yaml"), "items:\n  - name: base\nvalue: base\n");
      writeFileSync(join(root, "local", "sample.yaml"), "value: local\n");
      expect(await loadConfigYaml(root, "sample.yaml")).toEqual({ items: [{ name: "base" }], value: "local" });
      expect(await listLocalConfigOverlays(root)).toEqual(["config/local/sample.yaml"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("accepts an explicit empty object and rejects non-object roots", () => {
    expect(parseYamlObject("{}\n")).toEqual({});
    expect(() => parseYamlObject("[]\n", "array.yaml")).toThrow("array.yaml 根节点必须是对象");
    expect(() => parseYamlObject("null\n", "empty.yaml")).toThrow("empty.yaml 根节点必须是对象");
    expect(() => parseYamlObject("field: [\n", "invalid.yaml")).toThrow("invalid.yaml YAML 解析失败");
  });
});

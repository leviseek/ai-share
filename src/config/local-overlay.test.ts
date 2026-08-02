import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listLocalConfigOverlays,
  loadConfigYaml,
  loadConfigYamlWithTrace,
  mergeLocalOverlay,
} from "./local-overlay.ts";
import { parseYamlObject } from "../yaml.ts";
import { loadValidatedConfigWithTrace } from "./load.ts";

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

  test("tracks base and overlay sources with deep-merge replacement semantics", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-overlay-trace-"));
    try {
      mkdirSync(join(root, "local"), { recursive: true });
      writeFileSync(
        join(root, "sample.yaml"),
        "nested:\n  inherited: base\n  replaced: base\nitems:\n  - base\nempty: {}\n",
      );
      writeFileSync(join(root, "local", "sample.yaml"), "nested:\n  replaced: local\nitems:\n  - local\nadded: {}\n");

      const loaded = await loadConfigYamlWithTrace(root, "sample.yaml");
      expect(loaded.value).toEqual({
        nested: { inherited: "base", replaced: "local" },
        items: ["local"],
        empty: {},
        added: {},
      });
      expect(loaded.sources).toEqual({
        "nested.inherited": "config/sample.yaml",
        "nested.replaced": "config/local/sample.yaml",
        items: "config/local/sample.yaml",
        empty: "config/sample.yaml",
        added: "config/local/sample.yaml",
      });
      expect(loaded.overlay).toBe("config/local/sample.yaml");
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

  test("returns validated config provenance and active overlay files", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-config-trace-"));
    try {
      mkdirSync(join(root, "local"), { recursive: true });
      writeFileSync(join(root, "global.yaml"), "model: model-a\nprovider: provider-a\n");
      writeFileSync(
        join(root, "provider.yaml"),
        "providers:\n  provider-a:\n    base_url: https://example.test/v1\n    api_key: ${EXAMPLE_API_KEY}\n",
      );
      writeFileSync(
        join(root, "models.yaml"),
        "model-a:\n  model_name: upstream-a\nmodel-b:\n  model_name: upstream-b\n",
      );
      writeFileSync(join(root, "mcp.yaml"), "servers: {}\n");
      writeFileSync(join(root, "env.yaml"), "variables: {}\n");
      writeFileSync(
        join(root, "agents.yaml"),
        "agents:\n  commit:\n    description: Commit changes\n    model: model-a\n    reasoning_effort: low\n    mode: subagent\n    prompt: Create a commit.\n",
      );
      writeFileSync(join(root, "local", "global.yaml"), "model: model-b\n");

      const loaded = await loadValidatedConfigWithTrace(root);
      expect(loaded.config.global).toEqual({ model: "model-b", provider: "provider-a" });
      expect(loaded.provenance.global).toEqual({
        model: "config/local/global.yaml",
        provider: "config/global.yaml",
      });
      expect(loaded.config.agents.agents.commit?.model).toBe("model-a");
      expect(loaded.baseFiles).toEqual([
        "config/global.yaml",
        "config/provider.yaml",
        "config/models.yaml",
        "config/mcp.yaml",
        "config/env.yaml",
        "config/agents.yaml",
      ]);
      expect(loaded.overlays).toEqual(["config/local/global.yaml"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

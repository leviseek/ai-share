import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildYamlJsonSchemas, formatSchemaJson } from "./schema.ts";

const projectRoot = resolve(import.meta.dir, "..", "..");

describe("YAML JSON Schema exports", () => {
  test("keeps committed JSON Schema files aligned with schema.ts", () => {
    const schemas = buildYamlJsonSchemas();
    expect(schemas["plugins.schema.json"]).toBeDefined();
    for (const [fileName, schema] of Object.entries(schemas)) {
      const schemaPath = resolve(projectRoot, "docs", "schema", "json", fileName);
      expect(readFileSync(schemaPath, "utf8")).toBe(formatSchemaJson(schema));
    }
  });

  test("exports a structural safety pattern for plugin specs", () => {
    const pattern = pluginSpecPattern();
    expect(pattern).not.toBe("");
    const pluginSpec = new RegExp(pattern);

    expect(pluginSpec.test("opencode-example")).toBe(true);
    expect(pluginSpec.test("opencode-example@^1.2.3")).toBe(true);
    expect(pluginSpec.test("opencode-example@~1.2.3")).toBe(true);
    expect(pluginSpec.test("opencode-example@1.2.3-beta.1")).toBe(true);
    expect(pluginSpec.test("@scope/opencode-example@next")).toBe(true);
    expect(pluginSpec.test("superpowers@git+https://github.com/obra/superpowers.git")).toBe(true);

    for (const unsafeSpec of [
      "https://example.test/plugin.js",
      "file:///opt/opencode/plugin.js",
      "/opt/opencode/plugin.js",
      "./plugin.js",
      "../plugin.js",
      "C:\\Users\\example\\plugin.js",
      "pkg@git+https://user:password@github.com/org/repo.git",
      "pkg@git+https://github.com/org/repo.git?ref=main",
      "pkg@git+https://github.com/org/repo.git#main",
      "pkg@ ",
      "pkg@|",
      "pkg@+",
      "pkg@latest ",
      "pkg@1.2.3 || ",
      "pkg@>=1.2.3",
      "pkg@^1.2",
      "pkg@1.2.3 trailing",
    ]) {
      expect(pluginSpec.test(unsafeSpec)).toBe(false);
    }
  });
});

function pluginSpecPattern(): string {
  const schema = buildYamlJsonSchemas()["plugins.schema.json"];
  if (!schema || !isRecord(schema.properties)) return "";
  const plugins = schema.properties.plugins;
  if (!isRecord(plugins) || !isRecord(plugins.items)) return "";
  return typeof plugins.items.pattern === "string" ? plugins.items.pattern : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

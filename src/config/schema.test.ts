import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildYamlJsonSchemas, formatSchemaJson } from "./schema.ts";

const projectRoot = resolve(import.meta.dir, "..", "..");

describe("YAML JSON Schema exports", () => {
  test("keeps committed JSON Schema files aligned with schema.ts", () => {
    for (const [fileName, schema] of Object.entries(buildYamlJsonSchemas())) {
      const schemaPath = resolve(projectRoot, "docs", "schema", "json", fileName);
      expect(readFileSync(schemaPath, "utf8")).toBe(formatSchemaJson(schema));
    }
  });
});

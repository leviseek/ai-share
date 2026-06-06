#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildYamlJsonSchemas, formatSchemaJson } from "../config/schema.ts";

const outputDir = resolve(import.meta.dirname, "..", "..", "docs", "schema", "json");

await mkdir(outputDir, { recursive: true });

for (const [fileName, schema] of Object.entries(buildYamlJsonSchemas())) {
  await writeFile(resolve(outputDir, fileName), formatSchemaJson(schema), "utf8");
}

console.log(`已生成 JSON Schema：${outputDir}`);

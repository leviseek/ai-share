#!/usr/bin/env bun

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildYamlJsonSchemas, formatSchemaJson } from "../config/schema.ts";

const outputDir = resolve(import.meta.dirname, "..", "..", "docs", "schema", "json");

await mkdir(outputDir, { recursive: true });

const schemas = buildYamlJsonSchemas();
for (const [fileName, schema] of Object.entries(schemas)) {
  await writeFile(resolve(outputDir, fileName), formatSchemaJson(schema), "utf8");
}

for (const fileName of await readdir(outputDir)) {
  if (fileName.endsWith(".json") && !schemas[fileName]) await rm(resolve(outputDir, fileName));
}

console.log(`已生成 JSON Schema：${outputDir}`);

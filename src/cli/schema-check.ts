#!/usr/bin/env bun

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildYamlJsonSchemas, formatSchemaJson } from "../config/schema.ts";

const defaultOutputDir = resolve(import.meta.dirname, "..", "..", "docs", "schema", "json");

export async function checkGeneratedSchemas(outputDir: string = defaultOutputDir): Promise<string[]> {
  const expected = buildYamlJsonSchemas();
  const expectedNames = Object.keys(expected).sort();
  const actualNames = await listSchemaNames(outputDir);
  const findings: string[] = [];

  for (const name of expectedNames) {
    const schema = expected[name];
    if (!schema) continue;
    try {
      const actual = await readFile(resolve(outputDir, name), "utf8");
      if (actual !== formatSchemaJson(schema)) findings.push(`schema 内容漂移：${name}`);
    } catch (error) {
      if (isNotFound(error)) findings.push(`schema 文件缺失：${name}`);
      else throw error;
    }
  }

  for (const name of actualNames) {
    if (!expectedNames.includes(name)) findings.push(`存在废弃 schema 文件：${name}`);
  }
  return findings;
}

if (import.meta.main) {
  const findings = await checkGeneratedSchemas();
  if (findings.length > 0) {
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
  } else {
    console.log(`schema check passed: ${Object.keys(buildYamlJsonSchemas()).length} files`);
  }
}

async function listSchemaNames(outputDir: string): Promise<string[]> {
  try {
    return (await readdir(outputDir)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

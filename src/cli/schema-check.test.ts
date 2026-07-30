import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildYamlJsonSchemas, formatSchemaJson } from "../config/schema.ts";
import { checkGeneratedSchemas } from "./schema-check.ts";

describe("schema check", () => {
  test("detects missing, drifted and extra schema files without modifying them", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-schema-check-"));
    try {
      mkdirSync(root, { recursive: true });
      const entries = Object.entries(buildYamlJsonSchemas());
      const missing = requireEntry(entries[0]);
      const drifted = requireEntry(entries[1]);
      for (const [name, schema] of entries.slice(1)) {
        writeFileSync(join(root, name), name === drifted[0] ? "{}\n" : formatSchemaJson(schema), "utf8");
      }
      writeFileSync(join(root, "legacy.json"), "{}\n", "utf8");
      writeFileSync(join(root, "obsolete.schema.json"), "{}\n", "utf8");

      expect(await checkGeneratedSchemas(root)).toEqual([
        `schema 文件缺失：${missing[0]}`,
        `schema 内容漂移：${drifted[0]}`,
        "存在废弃 schema 文件：legacy.json",
        "存在废弃 schema 文件：obsolete.schema.json",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports every expected file when the schema directory is absent", async () => {
    const root = join(tmpdir(), `ai-share-missing-schema-${crypto.randomUUID()}`);
    const findings = await checkGeneratedSchemas(root);
    expect(findings).toHaveLength(Object.keys(buildYamlJsonSchemas()).length);
    expect(findings.every((finding) => finding.startsWith("schema 文件缺失："))).toBe(true);
  });
});

function requireEntry<T>(entry: T | undefined): T {
  if (!entry) throw new Error("expected schema entry");
  return entry;
}

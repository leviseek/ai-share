import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { check } from "./check.ts";

let originalWarn: typeof console.warn;
let warnings: string[];

beforeEach(() => {
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...data: unknown[]) => {
    warnings.push(data.map(String).join(" "));
  };
});

afterEach(() => {
  console.warn = originalWarn;
});

test("force resumes a blocked session without printing blocked wording", () => {
  const dir = mkdtempSync(join(tmpdir(), "context-guard-check-"));
  const configPath = join(dir, "opencode.json");
  const guardConfigPath = join(dir, "context-guard.json");
  const dbPath = join(dir, "opencode.db");
  const sessionId = "ses_force";

  writeFileSync(configPath, JSON.stringify({ max_input_tokens: 250000 }), "utf8");
  writeFileSync(guardConfigPath, JSON.stringify({ enabled: true, diagnostics: false }), "utf8");
  const db = new Database(dbPath);
  try {
    db.run("create table message (session_id text, data text, time_created integer)");
    db.run("insert into message values (?, ?, ?)", [
      sessionId,
      JSON.stringify({ role: "assistant", tokens: { input: 249167 } }),
      1,
    ]);
  } finally {
    db.close();
  }

  const exitCode = check(["aiomo", configPath, guardConfigPath, dbPath, "--", "-s", sessionId, "--force"]);

  expect(exitCode).toBe(0);
  const output = warnings.join("\n");
  expect(output).not.toContain("已阻止直接恢复");
  expect(output).not.toContain("默认不进入");
});

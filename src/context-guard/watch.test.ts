import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { watch } from "./watch.ts";

test("watcher binds to its first session and writes close history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "context-guard-watch-"));
  const configPath = join(dir, "opencode.json");
  const guardConfigPath = join(dir, "context-guard.json");
  const strategyPath = join(dir, "strategy.json");
  const dbPath = join(dir, "opencode.db");
  const historyDir = join(dir, ".opencode", "context-guard-history");

  writeFileSync(configPath, JSON.stringify({ max_input_tokens: 250000 }), "utf8");
  writeFileSync(
    guardConfigPath,
    JSON.stringify({ enabled: true, watch_interval_ms: 100, history_dir: ".opencode/context-guard-history" }),
    "utf8",
  );
  writeFileSync(strategyPath, JSON.stringify({ profile: "coding" }), "utf8");

  const db = new Database(dbPath);
  try {
    db.run("create table session (id text, directory text, time_updated integer)");
    db.run("create table message (session_id text, data text, time_created integer)");
  } finally {
    db.close();
  }

  const parent = Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 5000)"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const watcher = watch(["aiomo", configPath, guardConfigPath, strategyPath, dbPath, dir, String(parent.pid)]);

  const db1 = new Database(dbPath);
  try {
    db1.run("insert into session values (?, ?, ?)", ["ses_first", dir, Date.now() + 1000]);
    db1.run("insert into message values (?, ?, ?)", [
      "ses_first",
      JSON.stringify({ role: "assistant", tokens: { input: 1, output: 1 } }),
      Date.now() + 1000,
    ]);
  } finally {
    db1.close();
  }
  await sleep(1250);

  const db2 = new Database(dbPath);
  try {
    db2.run("insert into session values (?, ?, ?)", ["ses_second", dir, Date.now() + 1000]);
    db2.run("insert into message values (?, ?, ?)", [
      "ses_second",
      JSON.stringify({ role: "assistant", tokens: { input: 250000, output: 0 } }),
      Date.now() + 1000,
    ]);
  } finally {
    db2.close();
  }

  parent.kill();
  await Promise.resolve(parent.exited);
  expect(await watcher).toBe(true);
  expect(existsSync(historyDir)).toBe(true);
  const history = readdirSync(historyDir).map((file) => readFileSync(join(historyDir, file), "utf8"));
  expect(history.join("\n")).toContain("ses_first");
  expect(history.join("\n")).toContain("session-closed");
  expect(history.join("\n")).not.toContain("ses_second");
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

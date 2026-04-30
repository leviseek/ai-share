import { resolve } from "node:path";
import { mainAgentNames, omoAgentNames, omoCategoryNames } from "../shared.ts";
import { parseJson } from "./json.ts";
import { state } from "./state.ts";
import { tokenTotal } from "./tokens.ts";
import type { SqliteDb } from "./types.ts";

const openCodeDbPath = resolve(homeDir(), ".local", "share", "opencode", "opencode.db");
const tokenDbRefreshMs = 2_000;

let sqliteModulePromise: Promise<typeof import("bun:sqlite")> | undefined;
let sqliteDb: SqliteDb | undefined;

export async function refreshDbTokenSnapshot(now: number): Promise<void> {
  if (now - state.dbTokenLastRefreshAt < tokenDbRefreshMs) return;
  state.dbTokenLastRefreshAt = now;
  const db = await openReadonlyDb();
  if (!db) return;

  try {
    const rows = db
      .query(
        "SELECT m.id, m.session_id, m.time_created, m.data, s.parent_id FROM message m LEFT JOIN session s ON s.id = m.session_id WHERE m.time_created >= ? ORDER BY m.time_created ASC",
      )
      .all(state.session.startedAt - 60_000);
    const agents: Record<string, number> = {};
    const executions: Record<string, number> = {};
    let total = 0;
    const messageIds = new Set<string>();
    for (const row of rows) {
      if (state.dbTokenMessageIds.has(row.id)) continue;
      const parsed = parseJson(row.data);
      if (parsed?.role !== "assistant") continue;
      const agent = normalizeStoredAgentName(parsed.agent ?? parsed.mode, row.parent_id);
      executions[agent] = (executions[agent] ?? 0) + 1;
      const tokens = tokenTotal(parsed.tokens);
      if (tokens > 0) {
        agents[agent] = (agents[agent] ?? 0) + tokens;
        total += tokens;
      }
      messageIds.add(row.id);
    }
    for (const messageId of messageIds) state.dbTokenMessageIds.add(messageId);
    for (const [agent, executed] of Object.entries(executions)) {
      state.dbExecutions.agents[agent] = (state.dbExecutions.agents[agent] ?? 0) + executed;
    }
    for (const [agent, tokens] of Object.entries(agents)) {
      state.dbTokens.agents[agent] = (state.dbTokens.agents[agent] ?? 0) + tokens;
    }
    state.dbTokens.total += total;
  } catch {
    // SQLite fallback is best-effort; live event metrics must keep working if DB is locked/unavailable.
  }
}

async function openReadonlyDb(): Promise<SqliteDb | undefined> {
  try {
    sqliteModulePromise ??= import("bun:sqlite");
    const { Database } = await sqliteModulePromise;
    sqliteDb ??= new Database(openCodeDbPath, { readonly: true });
    return sqliteDb;
  } catch {
    return undefined;
  }
}

function normalizeStoredAgentName(name: unknown, parentId: string | null): string {
  if (typeof name !== "string" || name.length === 0) return "main";
  const clean = name.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const lowered = clean.toLowerCase();
  if (!parentId && (lowered === "root" || lowered.includes("deep agent") || lowered.includes("hephaestus")))
    return "main";
  if (!parentId && mainAgentNames.has(lowered)) return "main";
  for (const known of [...mainAgentNames, ...omoAgentNames, ...omoCategoryNames]) {
    if (lowered === known || lowered.startsWith(`${known} `) || lowered.includes(` ${known} `)) return known;
  }
  return clean || "main";
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
}

import { Database } from "bun:sqlite";
import { normalizePath } from "./process.ts";
import { summarizeMessages, type MessageStats, type SessionMessage, type SessionRecord } from "./text-summary.ts";

type SessionDirectoryRow = { id: string; directory: unknown; time_updated: unknown };
type ZeroOutputRow = { time_created?: unknown; input?: unknown; output?: unknown; finish?: unknown };
type MessageRow = { data: unknown; time_created?: unknown };

export function inspectSession(dbPath: string, sessionId: string): MessageStats {
  const messages = readSessionMessages(dbPath, sessionId);
  const tokenRow = queryOne(
    dbPath,
    (value): value is { input?: unknown } => isRecord(value),

    "select json_extract(data, '$.tokens.input') as input from message where session_id = ? and json_extract(data, '$.role') = 'assistant' and coalesce(json_extract(data, '$.tokens.input'), 0) > 0 order by time_created desc limit 1",
    sessionId,
  );
  const stats = summarizeMessages(messages);
  return { ...stats, inputTokens: Number(tokenRow?.input) || 0 };
}

export function findLatestSessionForDirectory(
  dbPath: string,
  cwd: string,
  sinceTimeUpdated: number,
): SessionDirectoryRow | undefined {
  const normalizedCwd = normalizePath(cwd);
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        "select id, directory, time_updated from session where directory is not null and time_updated >= ? order by time_updated desc limit 50",
      )
      .all(sinceTimeUpdated) as SessionDirectoryRow[];
    return rows.find((row) => normalizePath(row.directory) === normalizedCwd);
  } finally {
    db.close();
  }
}

export function inspectZeroOutputLoop(
  dbPath: string,
  sessionId: string,
  sinceTimeCreated: number,
): { count: number; latestFinish: unknown } {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        "select time_created, json_extract(data, '$.tokens.input') as input, json_extract(data, '$.tokens.output') as output, json_extract(data, '$.finish') as finish from message where session_id = ? and json_extract(data, '$.role') = 'assistant' and time_created >= ? order by time_created desc limit 12",
      )
      .all(sessionId, sinceTimeCreated) as ZeroOutputRow[];
    let count = 0;
    let latestFinish: unknown = undefined;
    for (const row of rows) {
      const input = Number(row.input) || 0;
      const output = Number(row.output) || 0;
      latestFinish ??= row.finish;
      if (input <= 0) continue;
      if (input > 0 && output === 0) count += 1;
      else break;
    }
    return { count, latestFinish };
  } finally {
    db.close();
  }
}

export function queryOne<T>(
  dbPath: string,
  refine: (value: unknown) => value is T,
  sql: string,
  value: string | number,
): T | undefined {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query(sql).get(value);
    return refine(row) ? row : undefined;
  } finally {
    db.close();
  }
}

export function readSession(dbPath: string, sessionId: string): SessionRecord | undefined {
  return queryOne(
    dbPath,
    isSessionRecord,
    "select id, title, directory, time_created, time_updated from session where id = ?",
    sessionId,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSessionRecord(value: unknown): value is SessionRecord {
  return isRecord(value);
}

export function readSessionMessages(dbPath: string, sessionId: string): SessionMessage[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query("select data, time_created from message where session_id = ? order by time_created asc")
      .all(sessionId) as MessageRow[];
    return rows.flatMap((row) => {
      const data = parseMessage(row.data);
      return data ? [{ data, timeCreated: row.time_created }] : [];
    });
  } finally {
    db.close();
  }
}

function parseMessage(value: unknown): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

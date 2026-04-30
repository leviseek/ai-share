import { Database } from "bun:sqlite";
import { normalizePath } from "./process.mjs";
import { summarizeMessages } from "./text-summary.mjs";

export function inspectSession(dbPath, sessionId) {
  const messages = readSessionMessages(dbPath, sessionId);
  const tokenRow = queryOne(
    dbPath,
    "select json_extract(data, '$.tokens.input') as input from message where session_id = ? and json_extract(data, '$.role') = 'assistant' and coalesce(json_extract(data, '$.tokens.input'), 0) > 0 order by time_created desc limit 1",
    sessionId,
  );
  const stats = summarizeMessages(messages);
  return { ...stats, inputTokens: Number(tokenRow?.input) || 0 };
}

export function findLatestSessionForDirectory(dbPath, cwd, sinceTimeUpdated) {
  const normalizedCwd = normalizePath(cwd);
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        "select id, directory, time_updated from session where directory is not null and time_updated >= ? order by time_updated desc limit 50",
      )
      .all(sinceTimeUpdated);
    return rows.find((row) => normalizePath(row.directory) === normalizedCwd);
  } finally {
    db.close();
  }
}

export function inspectZeroOutputLoop(dbPath, sessionId, sinceTimeCreated) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        "select time_created, json_extract(data, '$.tokens.input') as input, json_extract(data, '$.tokens.output') as output, json_extract(data, '$.finish') as finish from message where session_id = ? and json_extract(data, '$.role') = 'assistant' and time_created >= ? order by time_created desc limit 12",
      )
      .all(sessionId, sinceTimeCreated);
    let count = 0;
    let latestFinish = undefined;
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

export function queryOne(dbPath, sql, value) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.query(sql).get(value);
  } finally {
    db.close();
  }
}

export function readSession(dbPath, sessionId) {
  return queryOne(
    dbPath,
    "select id, title, directory, time_created, time_updated from session where id = ?",
    sessionId,
  );
}

export function readSessionMessages(dbPath, sessionId) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query("select data, time_created from message where session_id = ? order by time_created asc")
      .all(sessionId)
      .map((row) => ({ data: parseMessage(row.data), timeCreated: row.time_created }))
      .filter((row) => row.data);
  } finally {
    db.close();
  }
}

function parseMessage(value) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return undefined;
  }
}

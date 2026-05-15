import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const dbPath = resolve(import.meta.dirname, "../fixtures/sample.db");
const db = new Database(dbPath);
db.run(
  "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0)",
);
db.run("INSERT INTO sessions VALUES ('ses_fixture_001', '2026-05-01T10:00:00Z', 5000, 1500)");
db.run("INSERT INTO sessions VALUES ('ses_fixture_002', '2026-05-02T14:00:00Z', 12000, 4000)");
db.close();
console.log(`SQLite fixture created at ${dbPath}`);

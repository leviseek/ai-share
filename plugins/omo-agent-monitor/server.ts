import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAgent, mainAgentNames, omoAgentNames, omoCategoryNames, type AgentKind } from "./shared.ts";

type AgentSource = "subagent_type" | "agent" | "category" | "main" | "tool" | "fallback";
type AgentStatus = "unknown" | "running" | "idle";
type AgentInfo = {
  name: string;
  kind: AgentKind;
  source: AgentSource;
  parentAgent?: string;
  sessionId?: string;
  background: boolean;
};
type AgentMetric = AgentInfo & {
  status: AgentStatus;
  executed: number;
  totalMs: number;
  totalTokens: number;
  activeSince?: number;
  lastCompletedAt?: number;
  currentOperation?: string;
};
type ActiveCall = { agent: string; startedAt: number; operation?: string; info: AgentInfo };
type MonitorState = {
  updatedAt: number;
  session: {
    startedAt: number;
    lastActiveAt: number;
    totalActiveMs: number;
    activeWindowStart?: number;
    totalTokens: number;
    status: "idle" | "running" | string;
  };
  todos: unknown[];
  agents: Record<string, AgentMetric>;
  activeCalls: Record<string, ActiveCall>;
  dbTokens: { total: number; agents: Record<string, number> };
  dbExecutions: { agents: Record<string, number> };
  dbTokenMessageIds: Set<string>;
  dbTokenLastRefreshAt: number;
};
type SqliteRow = { id: string; session_id: string; time_created: number; data: string; parent_id: string | null };
type SqliteDb = { query(sql: string): { all(...params: unknown[]): SqliteRow[] } };
type Plugin = { id: string; server(): Promise<Record<string, (...args: any[]) => Promise<void>>> };

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");
const openCodeDbPath = resolve(homeDir(), ".local", "share", "opencode", "opencode.db");
const idleThresholdMs = 15_000;
const tokenDbRefreshMs = 2_000;
const taskToolNames = new Set(["delegate_task", "task", "call_omo_agent", "background_task"]);

const state: MonitorState = {
  updatedAt: Date.now(),
  session: {
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
    totalActiveMs: 0,
    totalTokens: 0,
    status: "idle",
  },
  todos: [],
  agents: {},
  activeCalls: {},
  dbTokens: { total: 0, agents: {} },
  dbExecutions: { agents: {} },
  dbTokenMessageIds: new Set(),
  dbTokenLastRefreshAt: 0,
};

let sqliteModulePromise: Promise<typeof import("bun:sqlite")> | undefined;
let sqliteDb: SqliteDb | undefined;

const plugin: Plugin = {
  id: "omo-agent-monitor",
  server: async () => ({
    "session.status": async (event: Record<string, any>) => {
      const status = stringField(event?.properties?.status, "type");
      if (status) state.session.status = status;
      await persist();
    },

    "todo.updated": async (event: Record<string, any>) => {
      const todos = event?.properties?.todos;
      if (Array.isArray(todos)) state.todos = todos;
      await persist();
    },

    "tool.execute.before": async (input: Record<string, any>, output: Record<string, any> | undefined) => {
      const args = firstRecord(input.args, output?.args, input, output);
      const info = agentInfo(input.tool, args);
      const operation = operationName(input.tool, args);
      const now = Date.now();
      const metric = ensureAgent(info.name);
      updateAgentInfo(metric, info);
      if (Object.keys(state.activeCalls).length === 0) {
        state.session.activeWindowStart = now;
      }
      state.session.status = "running";
      metric.status = "running";
      metric.activeSince = now;
      metric.currentOperation = operation;
      state.activeCalls[input.callID] = { agent: info.name, startedAt: now, operation, info };
      state.session.lastActiveAt = now;
      await persist();
    },

    "tool.execute.after": async (input: Record<string, any>, output: Record<string, any> | undefined) => {
      const args = firstRecord(input.args, output?.args, input, output);
      const info = agentInfo(input.tool, args);
      const active = state.activeCalls[input.callID] ?? {
        agent: info.name,
        startedAt: Date.now(),
        info,
      };
      const now = Date.now();
      const metric = ensureAgent(active.agent);
      updateAgentInfo(metric, active.info);
      const elapsed = Math.max(now - active.startedAt, 0);
      metric.executed += 1;
      metric.totalMs += elapsed;
      metric.lastCompletedAt = now;
      delete state.activeCalls[input.callID];
      metric.status = hasActiveCall(active.agent) ? "running" : "idle";
      if (!hasActiveCall(active.agent)) {
        delete metric.activeSince;
        delete metric.currentOperation;
      } else {
        const currentOperation = currentOperationOf(active.agent);
        if (currentOperation) metric.currentOperation = currentOperation;
      }

      const tokenDelta = extractTokens(input) + extractTokens(output);
      state.session.totalTokens += tokenDelta;
      metric.totalTokens += tokenDelta;
      state.session.lastActiveAt = now;
      if (Object.keys(state.activeCalls).length === 0 && state.session.activeWindowStart) {
        state.session.totalActiveMs += Math.max(now - state.session.activeWindowStart, 0);
        delete state.session.activeWindowStart;
        state.session.status = "idle";
      }
      await persist();
    },
  }),
};

function ensureAgent(name: string): AgentMetric {
  state.agents[name] ??= {
    name,
    status: "unknown",
    executed: 0,
    totalMs: 0,
    totalTokens: 0,
    kind: classifyAgent(name),
    source: "fallback",
    background: false,
  };
  return state.agents[name];
}

function updateAgentInfo(metric: AgentMetric, info: AgentInfo): void {
  metric.kind = info.kind;
  metric.source = info.source;
  metric.background = info.background;
  setOptionalString(metric, "parentAgent", info.parentAgent);
  setOptionalString(metric, "sessionId", info.sessionId);
}

function agentInfo(tool: string, args: unknown): AgentInfo {
  if (!isRecord(args)) {
    const name = taskToolNames.has(tool) ? "main" : tool;
    return {
      name,
      kind: classifyAgent(name),
      source: "tool",
      background: false,
    };
  }

  const subagent = stringField(args, "subagent_type") ?? stringField(args, "subagentType");
  const agent = stringField(args, "agent");
  const category = stringField(args, "category");
  const name = subagent ?? agent ?? category ?? (taskToolNames.has(tool) ? "main" : tool);
  const source = subagent
    ? "subagent_type"
    : agent
      ? "agent"
      : category
        ? "category"
        : taskToolNames.has(tool)
          ? "main"
          : "tool";

  const info: AgentInfo = {
    name,
    kind: source === "category" ? "category" : classifyAgent(name),
    source,
    background:
      booleanField(args, "run_in_background") ?? booleanField(args, "runInBackground") ?? tool === "background_task",
  };
  setOptionalString(
    info,
    "parentAgent",
    stringField(args, "parentAgent") ?? stringField(args, "parent_agent") ?? stringField(args, "parent"),
  );
  setOptionalString(info, "sessionId", readSessionId(args));
  return info;
}

function operationName(tool: string, args: unknown): string {
  if (!isRecord(args)) return tool;
  return stringField(args, "tool_name") ?? stringField(args, "description") ?? stringField(args, "command") ?? tool;
}

function hasActiveCall(agent: string): boolean {
  return Object.values(state.activeCalls).some((call) => call.agent === agent);
}

function currentOperationOf(agent: string): string | undefined {
  const hit = Object.values(state.activeCalls).find((call) => call.agent === agent);
  return hit?.operation;
}

async function persist(): Promise<void> {
  state.updatedAt = Date.now();
  const now = Date.now();
  await refreshDbTokenSnapshot(now);
  if (Object.keys(state.activeCalls).length > 0) {
    state.session.status = "running";
  } else if (state.session.status === "running" && now - state.session.lastActiveAt > idleThresholdMs) {
    state.session.status = "idle";
  }
  mkdirSync(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  const activeNow =
    state.session.activeWindowStart !== undefined ? Math.max(now - state.session.activeWindowStart, 0) : 0;
  const content = JSON.stringify(
    {
      updatedAt: state.updatedAt,
      session: {
        startedAt: state.session.startedAt,
        lastActiveAt: state.session.lastActiveAt,
        totalActiveMs: state.session.totalActiveMs + activeNow,
        totalTokens: state.session.totalTokens + state.dbTokens.total,
        status: state.session.status,
      },
      todos: state.todos,
      agents: mergedAgentMetrics(),
    },
    null,
    2,
  );
  writeFileSync(tempPath, content);
  renameSync(tempPath, statePath);
}

function mergedAgentMetrics(): AgentMetric[] {
  const agents = new Map(Object.entries(state.agents).map(([name, metric]) => [name, { ...metric }]));
  for (const [name, executed] of Object.entries(state.dbExecutions.agents)) {
    const metric = agents.get(name) ?? ensureAgent(name);
    if (metric.status === "unknown") metric.status = "idle";
    agents.set(name, { ...metric, executed: Math.max(metric.executed ?? 0, executed) });
  }
  for (const [name, tokens] of Object.entries(state.dbTokens.agents)) {
    const metric = agents.get(name) ?? ensureAgent(name);
    if (metric.status === "unknown") metric.status = "idle";
    agents.set(name, { ...metric, totalTokens: (metric.totalTokens ?? 0) + tokens });
  }
  return [...agents.values()];
}

async function refreshDbTokenSnapshot(now: number): Promise<void> {
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

function tokenTotal(tokens: unknown): number {
  if (!isRecord(tokens)) return 0;
  const total = numericTokenField(tokens, ["total", "totalTokens", "total_tokens"]);
  if (total !== undefined && total > 0) return total;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  return sumNumbers([
    numericTokenField(tokens, ["input", "inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]),
    numericTokenField(tokens, ["output", "outputTokens", "output_tokens", "completionTokens", "completion_tokens"]),
    numericTokenField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cache ? numericTokenField(cache, ["read", "cacheRead", "cache_read_tokens"]) : undefined,
    cache ? numericTokenField(cache, ["write", "cacheWrite", "cache_write_tokens"]) : undefined,
  ]);
}

function parseJson(value: string): Record<string, any> | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function booleanField(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "boolean" ? field : undefined;
}

function firstRecord(...values: unknown[]): Record<string, any> | undefined {
  return values.find((value) => isRecord(value));
}

function readSessionId(value: unknown): string | undefined {
  const direct = stringField(value, "sessionId") ?? stringField(value, "sessionID") ?? stringField(value, "session_id");
  if (direct) return direct;
  const metadata = isRecord(value) && isRecord(value.metadata) ? value.metadata : undefined;
  return metadata
    ? (stringField(metadata, "sessionId") ?? stringField(metadata, "sessionID") ?? stringField(metadata, "session_id"))
    : undefined;
}

function extractTokens(value: unknown): number {
  return scanTokenFields(value, new Set());
}

function scanTokenFields(value: unknown, visited: Set<object>): number {
  if (typeof value !== "object" || value === null) return 0;
  if (visited.has(value)) return 0;
  visited.add(value);

  const structured = structuredTokenTotal(value);
  if (structured > 0) return structured;

  const directTotal = numericTokenField(value, ["totalTokens", "total_tokens", "tokens"]);
  if (directTotal !== undefined) return directTotal;

  const directPair =
    (numericTokenField(value, ["inputTokens", "promptTokens", "prompt_tokens"]) ?? 0) +
    (numericTokenField(value, ["outputTokens", "completionTokens", "completion_tokens"]) ?? 0);

  let sum = 0;
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "number" && Number.isFinite(field) && /token/i.test(key)) {
      sum += Math.max(field, 0);
      continue;
    }
    if (typeof field === "object" && field !== null) {
      sum += scanTokenFields(field, visited);
    }
  }
  return Math.max(directPair, sum);
}

function structuredTokenTotal(value: unknown): number {
  const tokens =
    isRecord(value) && isRecord(value.tokens)
      ? value.tokens
      : isRecord(value) && isRecord(value.usage)
        ? value.usage
        : undefined;
  if (!tokens) return 0;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  return sumNumbers([
    numericTokenField(tokens, ["input", "inputTokens", "promptTokens", "prompt_tokens"]),
    numericTokenField(tokens, ["output", "outputTokens", "completionTokens", "completion_tokens"]),
    numericTokenField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cache ? numericTokenField(cache, ["read", "cacheRead", "cache_read_tokens"]) : undefined,
    cache ? numericTokenField(cache, ["write", "cacheWrite", "cache_write_tokens"]) : undefined,
  ]);
}

function sumNumbers(values: (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function setOptionalString<T extends object, K extends keyof T>(target: T, key: K, value: string | undefined): void {
  if (value === undefined) {
    delete target[key];
    return;
  }
  target[key] = value as T[K];
}

function numericTokenField(value: Record<string, any>, keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(candidate, 0);
    }
  }
  return undefined;
}

export default plugin;

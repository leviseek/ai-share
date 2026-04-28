import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");
const openCodeDbPath = resolve(homeDir(), ".local", "share", "opencode", "opencode.db");
const idleThresholdMs = 15_000;
const tokenDbRefreshMs = 2_000;
const taskToolNames = new Set(["delegate_task", "task", "call_omo_agent", "background_task"]);
const mainAgentNames = new Set(["main", "build", "plan"]);
const omoAgentNames = new Set([
  "sisyphus",
  "hephaestus",
  "prometheus",
  "oracle",
  "momus",
  "metis",
  "atlas",
  "sisyphus-junior",
  "explorer",
  "librarian",
  "multimodal-looker",
]);
const omoCategoryNames = new Set([
  "ultrabrain",
  "deep",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "visual-engineering",
  "artistry",
]);

const state = {
  updatedAt: Date.now(),
  session: {
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
    totalActiveMs: 0,
    activeWindowStart: undefined,
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

let sqliteModulePromise;
let sqliteDb;

const plugin = {
  id: "omo-agent-monitor",
  server: async () => ({
    "session.status": async (event) => {
      const status = stringField(event?.properties?.status, "type");
      if (status) state.session.status = status;
      await persist();
    },

    "todo.updated": async (event) => {
      const todos = event?.properties?.todos;
      if (Array.isArray(todos)) state.todos = todos;
      await persist();
    },

    "tool.execute.before": async (input, output) => {
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

    "tool.execute.after": async (input, output) => {
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
        metric.currentOperation = currentOperationOf(active.agent);
      }

      const tokenDelta = extractTokens(input) + extractTokens(output);
      state.session.totalTokens += tokenDelta;
      metric.totalTokens += tokenDelta;
      state.session.lastActiveAt = now;
      if (Object.keys(state.activeCalls).length === 0 && state.session.activeWindowStart) {
        state.session.totalActiveMs += Math.max(now - state.session.activeWindowStart, 0);
        state.session.activeWindowStart = undefined;
        state.session.status = "idle";
      }
      await persist();
    },
  }),
};

function ensureAgent(name) {
  state.agents[name] ??= {
    name,
    status: "unknown",
    executed: 0,
    totalMs: 0,
    totalTokens: 0,
    kind: classifyAgent(name),
    source: "fallback",
    parentAgent: undefined,
    sessionId: undefined,
    background: false,
    currentOperation: undefined,
  };
  return state.agents[name];
}

function updateAgentInfo(metric, info) {
  metric.kind = info.kind;
  metric.source = info.source;
  metric.background = info.background;
  metric.parentAgent = info.parentAgent;
  metric.sessionId = info.sessionId;
}

function agentInfo(tool, args) {
  if (!isRecord(args)) {
    const name = taskToolNames.has(tool) ? "main" : tool;
    return {
      name,
      kind: classifyAgent(name),
      source: "tool",
      parentAgent: undefined,
      sessionId: undefined,
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

  return {
    name,
    kind: source === "category" ? "category" : classifyAgent(name),
    source,
    parentAgent: stringField(args, "parentAgent") ?? stringField(args, "parent_agent") ?? stringField(args, "parent"),
    sessionId: readSessionId(args),
    background:
      booleanField(args, "run_in_background") ?? booleanField(args, "runInBackground") ?? tool === "background_task",
  };
}

function classifyAgent(name) {
  if (mainAgentNames.has(name)) return "main";
  if (omoCategoryNames.has(name)) return "category";
  if (omoAgentNames.has(name)) return "subagent";
  return "tool";
}

function operationName(tool, args) {
  if (!isRecord(args)) return tool;
  return stringField(args, "tool_name") ?? stringField(args, "description") ?? stringField(args, "command") ?? tool;
}

function hasActiveCall(agent) {
  return Object.values(state.activeCalls).some((call) => call.agent === agent);
}

function currentOperationOf(agent) {
  const hit = Object.values(state.activeCalls).find((call) => call.agent === agent);
  return hit?.operation;
}

async function persist() {
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

function mergedAgentMetrics() {
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

async function refreshDbTokenSnapshot(now) {
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
    const agents = {};
    const executions = {};
    let total = 0;
    const messageIds = new Set();
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

async function openReadonlyDb() {
  try {
    sqliteModulePromise ??= import("bun:sqlite");
    const { Database } = await sqliteModulePromise;
    sqliteDb ??= new Database(openCodeDbPath, { readonly: true });
    return sqliteDb;
  } catch {
    return undefined;
  }
}

function normalizeStoredAgentName(name, parentId) {
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

function tokenTotal(tokens) {
  if (!isRecord(tokens)) return 0;
  const total = numericTokenField(tokens, ["total", "totalTokens", "total_tokens"]);
  if (total !== undefined && total > 0) return total;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  return [
    numericTokenField(tokens, ["input", "inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]),
    numericTokenField(tokens, ["output", "outputTokens", "output_tokens", "completionTokens", "completion_tokens"]),
    numericTokenField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cache ? numericTokenField(cache, ["read", "cacheRead", "cache_read_tokens"]) : undefined,
    cache ? numericTokenField(cache, ["write", "cacheWrite", "cache_write_tokens"]) : undefined,
  ].reduce((sum, value) => sum + (value ?? 0), 0);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function homeDir() {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function stringField(value, key) {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function booleanField(value, key) {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "boolean" ? field : undefined;
}

function firstRecord(...values) {
  return values.find((value) => isRecord(value));
}

function readSessionId(value) {
  const direct = stringField(value, "sessionId") ?? stringField(value, "sessionID") ?? stringField(value, "session_id");
  if (direct) return direct;
  const metadata = isRecord(value?.metadata) ? value.metadata : undefined;
  return metadata
    ? (stringField(metadata, "sessionId") ?? stringField(metadata, "sessionID") ?? stringField(metadata, "session_id"))
    : undefined;
}

function extractTokens(value) {
  return scanTokenFields(value, new Set());
}

function scanTokenFields(value, visited) {
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

function structuredTokenTotal(value) {
  const tokens = isRecord(value?.tokens) ? value.tokens : isRecord(value?.usage) ? value.usage : undefined;
  if (!tokens) return 0;
  const cache = isRecord(tokens.cache) ? tokens.cache : undefined;
  return [
    numericTokenField(tokens, ["input", "inputTokens", "promptTokens", "prompt_tokens"]),
    numericTokenField(tokens, ["output", "outputTokens", "completionTokens", "completion_tokens"]),
    numericTokenField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cache ? numericTokenField(cache, ["read", "cacheRead", "cache_read_tokens"]) : undefined,
    cache ? numericTokenField(cache, ["write", "cacheWrite", "cache_write_tokens"]) : undefined,
  ].reduce((total, value) => total + (value ?? 0), 0);
}

function numericTokenField(value, keys) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(candidate, 0);
    }
  }
  return undefined;
}

export default plugin;

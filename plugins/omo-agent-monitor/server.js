import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");

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
};

const plugin = {
  id: "omo-agent-monitor",
  server: async () => ({
    "session.status": async (event) => {
      const status = stringField(event?.properties?.status, "type");
      if (status) state.session.status = status;
      persist();
    },

    "todo.updated": async (event) => {
      const todos = event?.properties?.todos;
      if (Array.isArray(todos)) state.todos = todos;
      persist();
    },

    "tool.execute.before": async (input, output) => {
      const agent = agentName(input.tool, output?.args);
      const operation = operationName(input.tool, output?.args);
      const now = Date.now();
      const metric = ensureAgent(agent);
      if (Object.keys(state.activeCalls).length === 0) {
        state.session.activeWindowStart = now;
      }
      metric.status = "running";
      metric.activeSince = now;
      metric.currentOperation = operation;
      state.activeCalls[input.callID] = { agent, startedAt: now, operation };
      state.session.lastActiveAt = now;
      persist();
    },

    "tool.execute.after": async (input, output) => {
      const active = state.activeCalls[input.callID] ?? {
        agent: agentName(input.tool, input.args),
        startedAt: Date.now(),
      };
      const now = Date.now();
      const metric = ensureAgent(active.agent);
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
      state.session.lastActiveAt = now;
      if (Object.keys(state.activeCalls).length === 0 && state.session.activeWindowStart) {
        state.session.totalActiveMs += Math.max(now - state.session.activeWindowStart, 0);
        state.session.activeWindowStart = undefined;
      }
      persist();
    },
  }),
};

function ensureAgent(name) {
  state.agents[name] ??= {
    name,
    status: "unknown",
    executed: 0,
    totalMs: 0,
    currentOperation: undefined,
  };
  return state.agents[name];
}

function agentName(tool, args) {
  if (!isRecord(args)) return tool;
  return stringField(args, "agent") ?? stringField(args, "subagent_type") ?? stringField(args, "category") ?? "main";
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

function persist() {
  state.updatedAt = Date.now();
  mkdirSync(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  const activeNow =
    state.session.activeWindowStart !== undefined ? Math.max(Date.now() - state.session.activeWindowStart, 0) : 0;
  const content = JSON.stringify(
    {
      updatedAt: state.updatedAt,
      session: {
        startedAt: state.session.startedAt,
        lastActiveAt: state.session.lastActiveAt,
        totalActiveMs: state.session.totalActiveMs + activeNow,
        totalTokens: state.session.totalTokens,
        status: state.session.status,
      },
      todos: state.todos,
      agents: Object.values(state.agents),
    },
    null,
    2,
  );
  writeFileSync(tempPath, content);
  renameSync(tempPath, statePath);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function stringField(value, key) {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function extractTokens(value) {
  return scanTokenFields(value, new Set());
}

function scanTokenFields(value, visited) {
  if (typeof value !== "object" || value === null) return 0;
  if (visited.has(value)) return 0;
  visited.add(value);

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

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");

const state = {
  updatedAt: Date.now(),
  agents: {},
  activeCalls: {},
};

const plugin = {
  id: "omo-agent-monitor",
  server: async () => ({
    "tool.execute.before": async (input, output) => {
      const agent = agentName(input.tool, output?.args);
      const now = Date.now();
      const metric = ensureAgent(agent);
      metric.status = "running";
      metric.activeSince = now;
      state.activeCalls[input.callID] = { agent, startedAt: now };
      persist();
    },

    "tool.execute.after": async (input) => {
      const active = state.activeCalls[input.callID] ?? {
        agent: agentName(input.tool, input.args),
        startedAt: Date.now(),
      };
      const metric = ensureAgent(active.agent);
      const elapsed = Math.max(Date.now() - active.startedAt, 0);
      metric.executed += 1;
      metric.totalMs += elapsed;
      delete state.activeCalls[input.callID];
      metric.status = hasActiveCall(active.agent) ? "running" : "idle";
      if (!hasActiveCall(active.agent)) delete metric.activeSince;
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
  };
  return state.agents[name];
}

function agentName(tool, args) {
  if (!isRecord(args)) return tool;
  return stringField(args, "subagent_type") ?? stringField(args, "category") ?? stringField(args, "agent") ?? tool;
}

function hasActiveCall(agent) {
  return Object.values(state.activeCalls).some((call) => call.agent === agent);
}

function persist() {
  state.updatedAt = Date.now();
  mkdirSync(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  const content = JSON.stringify(
    {
      updatedAt: state.updatedAt,
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

export default plugin;

import { classifyAgent } from "../shared.ts";
import type { AgentInfo, AgentMetric, MonitorState } from "./types.ts";
import { setOptionalString } from "./json.ts";

export const state: MonitorState = {
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

export function ensureAgent(name: string): AgentMetric {
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

export function updateAgentInfo(metric: AgentMetric, info: AgentInfo): void {
  metric.kind = info.kind;
  metric.source = info.source;
  metric.background = info.background;
  setOptionalString(metric, "parentAgent", info.parentAgent);
  setOptionalString(metric, "sessionId", info.sessionId);
}

export function hasActiveCall(agent: string): boolean {
  return Object.values(state.activeCalls).some((call) => call.agent === agent);
}

export function currentOperationOf(agent: string): string | undefined {
  const hit = Object.values(state.activeCalls).find((call) => call.agent === agent);
  return hit?.operation;
}

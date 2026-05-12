import { state } from "./state.ts";
import { classifyAgent } from "../shared.ts";
import type { AgentMetric } from "./types.ts";

function fallbackMetric(name: string): AgentMetric {
  return {
    name,
    kind: classifyAgent(name),
    source: "fallback",
    background: false,
    status: "unknown",
    executed: 0,
    totalMs: 0,
    totalTokens: 0,
  };
}

export function buildPersistedStateSnapshot(now: number): {
  updatedAt: number;
  session: {
    startedAt: number;
    lastActiveAt: number;
    totalActiveMs: number;
    totalTokens: number;
    status: string;
  };
  todos: unknown[];
  agents: AgentMetric[];
} {
  const activeNow =
    state.session.activeWindowStart !== undefined ? Math.max(now - state.session.activeWindowStart, 0) : 0;
  const agents = new Map<string, AgentMetric>(
    Object.entries(state.agents).map(([name, metric]) => [name, { ...metric }]),
  );

  for (const [name, executed] of Object.entries(state.dbExecutions.agents)) {
    const metric = agents.get(name) ?? fallbackMetric(name);
    if (metric.status === "unknown") metric.status = "idle";
    agents.set(name, { ...metric, executed: Math.max(metric.executed ?? 0, executed) });
  }

  for (const [name, tokens] of Object.entries(state.dbTokens.agents)) {
    const metric = agents.get(name) ?? fallbackMetric(name);
    if (metric.status === "unknown") metric.status = "idle";
    agents.set(name, { ...metric, totalTokens: (metric.totalTokens ?? 0) + tokens });
  }

  return {
    updatedAt: now,
    session: {
      startedAt: state.session.startedAt,
      lastActiveAt: state.session.lastActiveAt,
      totalActiveMs: state.session.totalActiveMs + activeNow,
      totalTokens: state.session.totalTokens + state.dbTokens.total,
      status: state.session.status,
    },
    todos: state.todos,
    agents: [...agents.values()],
  };
}

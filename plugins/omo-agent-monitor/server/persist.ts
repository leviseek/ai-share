import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureAgent, state } from "./state.ts";
import { refreshDbTokenSnapshot } from "./sqlite.ts";
import type { AgentMetric } from "./types.ts";

const idleThresholdMs = 15_000;

export async function persist(statePath: string): Promise<void> {
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

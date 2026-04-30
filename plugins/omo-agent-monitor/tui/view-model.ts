import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAgentKind, defaultAgentNames } from "../shared.ts";
import type { MonitorAgent, MonitorState, ViewModel } from "./types.ts";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "..", "omo-agent-monitor-state.json");

export function buildViewModel(): ViewModel {
  const state = loadMonitorState();
  const todos = Array.isArray(state.todos) ? state.todos : [];
  const done = todos.filter((todo) => todo.status === "completed").length;
  const inProgress = todos.filter((todo) => todo.status === "in_progress");
  const pending = todos.filter((todo) => todo.status === "pending");
  const progress = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;
  const now = Date.now();
  const agents = mergeAgents(Array.isArray(state.agents) ? state.agents : []);
  const startedAt = state.session?.startedAt ?? now;
  const activeMs = Math.max(state.session?.totalActiveMs ?? 0, 0);
  const elapsedMs = Math.max(now - startedAt, 0);
  const idleMs = Math.max(elapsedMs - activeMs, 0);

  return {
    updatedAt: state.updatedAt ?? now,
    session: {
      status: state.session?.status ?? "idle",
      startedAt,
      elapsedMs,
      activeMs,
      idleMs,
      totalTokens: state.session?.totalTokens ?? 0,
    },
    todos: {
      total: todos.length,
      done,
      inProgress: inProgress.map((todo) => todo.content),
      pending: pending.length,
      progress,
    },
    agents: agents.map((agent) => {
      const executed = Number(agent.executed ?? 0);
      const totalMs = Number(agent.totalMs ?? 0);
      const status = agent.name === "main" && agent.status === "unknown" ? "idle" : (agent.status ?? "unknown");
      return {
        name: agent.name,
        displayName: displayAgentName(agent),
        kind: typeof agent.kind === "string" ? agent.kind : "tool",
        source: typeof agent.source === "string" ? agent.source : "fallback",
        background: Boolean(agent.background),
        parentAgent: typeof agent.parentAgent === "string" ? agent.parentAgent : "",
        status,
        executed,
        totalTokens: Number(agent.totalTokens ?? 0),
        avgMs: executed > 0 ? Math.round(totalMs / executed) : 0,
        currentOperation: typeof agent.currentOperation === "string" ? agent.currentOperation : "",
      };
    }),
  };
}

function mergeAgents(agents: MonitorAgent[]): MonitorAgent[] {
  const seen = new Set(agents.map((agent) => agent.name).filter((name) => typeof name === "string" && name.length > 0));
  return [
    ...agents,
    ...defaultAgentNames
      .filter((name) => !seen.has(name))
      .map<MonitorAgent>((name) => ({
        name,
        kind: defaultAgentKind(name),
        source: "fallback",
        background: false,
        status: "idle",
        executed: 0,
        totalMs: 0,
        totalTokens: 0,
        currentOperation: "-",
      })),
  ];
}

function displayAgentName(agent: MonitorAgent): string {
  return agent.name === "main" ? "Hephaestus（主入口）" : agent.name;
}

function loadMonitorState(): MonitorState {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

import type { AgentKind } from "../shared.ts";

export type AgentSource = "subagent_type" | "agent" | "category" | "main" | "tool" | "fallback";
export type AgentStatus = "unknown" | "running" | "idle";
export type AgentInfo = {
  name: string;
  kind: AgentKind;
  source: AgentSource;
  parentAgent?: string;
  sessionId?: string;
  background: boolean;
};
export type AgentMetric = AgentInfo & {
  status: AgentStatus;
  executed: number;
  totalMs: number;
  totalTokens: number;
  activeSince?: number;
  lastCompletedAt?: number;
  currentOperation?: string;
};
export type ActiveCall = { agent: string; startedAt: number; operation?: string; info: AgentInfo };
export type MonitorState = {
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
export type SqliteRow = {
  id: string;
  session_id: string;
  time_created: number;
  data: string;
  parent_id: string | null;
};
export type SqliteDb = { query(sql: string): { all(...params: unknown[]): SqliteRow[] } };
export type Plugin = { id: string; server(): Promise<Record<string, (...args: any[]) => Promise<void>>> };

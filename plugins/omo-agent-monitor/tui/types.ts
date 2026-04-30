import type { AgentKind } from "../shared.ts";

export type AgentStatus = "running" | "retry" | "error" | "idle" | "unknown";
export type MonitorAgent = {
  name: string;
  displayName?: string;
  kind?: AgentKind;
  source?: string;
  background?: boolean;
  parentAgent?: string;
  status?: AgentStatus;
  executed?: number;
  totalMs?: number;
  totalTokens?: number;
  avgMs?: number;
  currentOperation?: string;
};
export type MonitorState = {
  updatedAt?: number;
  session?: { status?: AgentStatus; startedAt?: number; totalActiveMs?: number; totalTokens?: number };
  todos?: { status?: string; content?: string }[];
  agents?: MonitorAgent[];
};
export type ViewAgent = Required<
  Pick<
    MonitorAgent,
    | "name"
    | "displayName"
    | "kind"
    | "source"
    | "background"
    | "parentAgent"
    | "status"
    | "executed"
    | "totalTokens"
    | "avgMs"
    | "currentOperation"
  >
>;
export type ViewModel = {
  updatedAt: number;
  session: {
    status: AgentStatus;
    startedAt: number;
    elapsedMs: number;
    activeMs: number;
    idleMs: number;
    totalTokens: number;
  };
  todos: { total: number; done: number; inProgress: (string | undefined)[]; pending: number; progress: number };
  agents: ViewAgent[];
};
export type Plugin = {
  id: string;
  tui(api: { command: { register(callback: () => unknown[]): void } }): Promise<void>;
};

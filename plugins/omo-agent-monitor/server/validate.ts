import type { AgentMetric, MonitorState } from "./types.ts";

const MIN_VALID_TIMESTAMP_MS = 1_704_000_000_000; // 2024-01-01 in ms

export interface ValidationResult {
  valid: boolean;
  repaired: Partial<MonitorState>;
  warnings: string[];
}

function clampNonNegative(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(value, 0);
  }
  return fallback;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > MIN_VALID_TIMESTAMP_MS;
}

function sanitizeAgentMetric(name: string, metric: Record<string, unknown>): AgentMetric {
  return {
    name,
    kind: (typeof metric.kind === "string" ? metric.kind : "tool") as AgentMetric["kind"],
    source: (typeof metric.source === "string" ? metric.source : "fallback") as AgentMetric["source"],
    background: typeof metric.background === "boolean" ? metric.background : false,
    status: (typeof metric.status === "string" ? metric.status : "unknown") as AgentMetric["status"],
    executed: clampNonNegative(metric.executed, 0),
    totalMs: clampNonNegative(metric.totalMs, 0),
    totalTokens: clampNonNegative(metric.totalTokens, 0),
  };
}

export function validateState(raw: MonitorState): ValidationResult {
  const warnings: string[] = [];

  // Clamp session numbers with warning detection
  const session = { ...raw.session };
  const rawActiveMs = session.totalActiveMs;
  const rawTokens = session.totalTokens;
  session.totalActiveMs = clampNonNegative(session.totalActiveMs, 0);
  session.totalTokens = clampNonNegative(session.totalTokens, 0);
  if (typeof rawActiveMs === "number" && rawActiveMs < 0) {
    warnings.push(`clamped negative session.totalActiveMs (${rawActiveMs} → 0)`);
  }
  if (typeof rawTokens === "number" && rawTokens < 0) {
    warnings.push(`clamped negative session.totalTokens (${rawTokens} → 0)`);
  }
  session.startedAt = isValidTimestamp(session.startedAt) ? session.startedAt : Date.now();
  session.lastActiveAt = isValidTimestamp(session.lastActiveAt) ? session.lastActiveAt : Date.now();

  // Validate status string
  if (typeof session.status !== "string" || session.status.length === 0) {
    session.status = "idle";
    warnings.push("session.status reset to 'idle' (was empty/invalid)");
  }

  // Validate updatedAt
  const updatedAt = isValidTimestamp(raw.updatedAt) ? raw.updatedAt : Date.now();

  // Validate todos
  const todos = Array.isArray(raw.todos) ? raw.todos : [];

  // Validate agents with clamping detection
  const agents: Record<string, AgentMetric> = {};
  if (raw.agents && typeof raw.agents === "object" && !Array.isArray(raw.agents)) {
    for (const [name, metric] of Object.entries(raw.agents)) {
      if (typeof name !== "string" || name.length === 0) {
        warnings.push("removed agent entry with empty name");
        continue;
      }
      if (!metric || typeof metric !== "object") {
        warnings.push(`removed invalid agent metric for "${name}"`);
        continue;
      }
      const rawMetric = metric as Record<string, unknown>;
      const sanitized = sanitizeAgentMetric(name, rawMetric);
      if (typeof rawMetric.executed === "number" && rawMetric.executed < 0) {
        warnings.push(`clamped negative executed for agent "${name}"`);
      }
      if (typeof rawMetric.totalMs === "number" && rawMetric.totalMs < 0) {
        warnings.push(`clamped negative totalMs for agent "${name}"`);
      }
      if (typeof rawMetric.totalTokens === "number" && rawMetric.totalTokens < 0) {
        warnings.push(`clamped negative totalTokens for agent "${name}"`);
      }
      agents[name] = sanitized;
    }
  }

  const repaired: Partial<MonitorState> = {
    updatedAt,
    session,
    todos,
    agents,
  };

  // Handle dbTokens
  if (raw.dbTokens && typeof raw.dbTokens === "object") {
    const dbTokens = raw.dbTokens as Record<string, unknown>;
    repaired.dbTokens = {
      total: clampNonNegative(dbTokens.total, 0),
      agents:
        typeof dbTokens.agents === "object" && dbTokens.agents !== null
          ? (dbTokens.agents as Record<string, number>)
          : {},
    };
    if (clampNonNegative(dbTokens.total, 0) !== (dbTokens.total as number)) {
      warnings.push("clamped negative dbTokens.total");
    }
  }

  // Handle dbExecutions
  if (raw.dbExecutions && typeof raw.dbExecutions === "object") {
    const dbExec = raw.dbExecutions as Record<string, unknown>;
    repaired.dbExecutions = {
      agents:
        typeof dbExec.agents === "object" && dbExec.agents !== null ? (dbExec.agents as Record<string, number>) : {},
    };
  }

  return {
    valid: warnings.length === 0,
    repaired,
    warnings,
  };
}

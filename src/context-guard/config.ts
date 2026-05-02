import { readFileSync } from "node:fs";

export type GuardConfig = {
  enabled: boolean;
  warn_ratio: number;
  danger_ratio: number;
  block_ratio: number;
  absolute_block_tokens: number;
  rescue_dir: string;
  diagnostics: boolean;
  watch_interval_ms: number;
  zero_output_limit: number;
  watch_action: string;
  alert_file: string;
  history_dir: string;
};

export type StrategyConfig = {
  profile?: string;
  workspace?: { ignore?: unknown };
  opencode?: { dcp?: { context_budget_tokens?: unknown } };
  oh_my_openagent?: { dcp?: { context_budget_tokens?: unknown } };
};

export const DEFAULT_GUARD: GuardConfig = {
  enabled: true,
  warn_ratio: 0.5,
  danger_ratio: 0.75,
  block_ratio: 0.9,
  absolute_block_tokens: 180000,
  rescue_dir: ".opencode-rescue",
  diagnostics: true,
  watch_interval_ms: 5000,
  zero_output_limit: 3,
  watch_action: "stop",
  alert_file: ".opencode/context-guard-alert.json",
  history_dir: ".opencode/context-guard-history",
};

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function readGuardConfig(path: string): GuardConfig {
  return { ...DEFAULT_GUARD, ...readJson<Partial<GuardConfig>>(path, {}) };
}

export function readStrategyConfig(path: string): StrategyConfig | undefined {
  return readJson<StrategyConfig | undefined>(path, undefined);
}

export function readMaxInputTokens(path: string): number {
  const config = readJson<{ max_input_tokens?: unknown; compaction?: { max_input_tokens?: unknown } }>(path, {});
  return Number(config.max_input_tokens) || Number(config.compaction?.max_input_tokens) || 120000;
}

export function strategyBudgetTokens(strategy: StrategyConfig | undefined): number {
  const values = [
    Number(strategy?.opencode?.dcp?.context_budget_tokens) || 0,
    Number(strategy?.oh_my_openagent?.dcp?.context_budget_tokens) || 0,
  ].filter((value) => value > 0);
  return values.length > 0 ? Math.min(...values) : 0;
}

export function workspaceIgnore(strategy: StrategyConfig | undefined): string[] {
  const ignore = strategy?.workspace?.ignore;
  if (!Array.isArray(ignore)) return [];
  return ignore.flatMap((value) => (typeof value === "string" && value.length > 0 ? [value] : []));
}

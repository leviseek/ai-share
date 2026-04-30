import { readFileSync } from "node:fs";

export const DEFAULT_GUARD = {
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

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function readGuardConfig(path) {
  return { ...DEFAULT_GUARD, ...readJson(path, {}) };
}

export function readStrategyConfig(path) {
  return readJson(path, undefined);
}

export function readMaxInputTokens(path) {
  const config = readJson(path, {});
  return Number(config?.max_input_tokens) || Number(config?.compaction?.max_input_tokens) || 120000;
}

export function strategyBudgetTokens(strategy) {
  const values = [
    Number(strategy?.opencode?.dcp?.context_budget_tokens) || 0,
    Number(strategy?.oh_my_openagent?.dcp?.context_budget_tokens) || 0,
  ].filter((value) => value > 0);
  return values.length > 0 ? Math.min(...values) : 0;
}

export function workspaceIgnore(strategy) {
  const ignore = strategy?.workspace?.ignore;
  return Array.isArray(ignore) ? ignore.filter((value) => typeof value === "string" && value.length > 0) : [];
}

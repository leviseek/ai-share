import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_GUARD,
  readGuardConfig,
  readStrategyConfig,
  readMaxInputTokens,
  strategyBudgetTokens,
} from "./config.ts";
import {
  findLatestSessionForDirectory,
  findSessionForDirectoryById,
  inspectSession,
  inspectZeroOutputLoop,
} from "./db.ts";
import { riskLevel, shouldStop } from "./risk.ts";
import { processAlive, sleep, stopProcessTree } from "./process.ts";

type Alert = {
  launcher: string;
  reason: string;
  session_id?: string;
  directory?: unknown;
  profile?: string;
  input_tokens?: number;
  max_input_tokens?: number;
  base_max_input_tokens?: number;
  strategy_context_budget_tokens?: number;
  zero_output_steps?: number;
  latest_finish?: unknown;
  time: string;
  local_time: string;
  continue_command?: string;
  recommendation?: string;
  error?: string;
};

type WatchState = {
  boundSessionId?: string;
  warnedKey?: string;
  startedAt: number;
  closed: boolean;
};

export async function watch(args: string[]): Promise<boolean> {
  const [launcher, configPath, guardConfigPath, strategyPath, dbPath, cwd, parentPidValue] = args;
  if (!launcher || !configPath || !guardConfigPath || !strategyPath || !dbPath || !cwd) {
    return false;
  }

  const guard = readGuardConfig(guardConfigPath);
  if (!guard.enabled) return true;

  const baseMaxInputTokens = readMaxInputTokens(configPath);
  const strategy = readStrategyConfig(strategyPath);
  const maxInputTokens = baseMaxInputTokens;
  const softBudgetTokens = strategyBudgetTokens(strategy);
  const intervalMs = Math.max(1000, guard.watch_interval_ms || DEFAULT_GUARD.watch_interval_ms);
  const parentPid = Number(parentPidValue) || 0;
  const alertPath = resolve(cwd, guard.alert_file || DEFAULT_GUARD.alert_file);
  const historyDir = resolve(cwd, guard.history_dir || DEFAULT_GUARD.history_dir);
  const state: WatchState = { startedAt: Date.now(), closed: false };

  while (true) {
    if (parentPid > 0 && !processAlive(parentPid)) {
      writeSessionClosedHistory(launcher, alertPath, historyDir, state);
      return true;
    }
    try {
      const session = state.boundSessionId
        ? findSessionForDirectoryById(dbPath, cwd, state.boundSessionId)
        : findLatestSessionForDirectory(dbPath, cwd, state.startedAt);
      if (session) {
        state.boundSessionId ??= session.id;
        const stats = inspectSession(dbPath, session.id);
        const zeroLoop = inspectZeroOutputLoop(dbPath, session.id, state.startedAt);
        const level = riskLevel(stats.inputTokens, maxInputTokens, guard);
        const softBudgetExceeded = softBudgetTokens > 0 && stats.inputTokens >= softBudgetTokens;
        const shouldAlert =
          level !== "safe" ||
          softBudgetExceeded ||
          zeroLoop.count >= (guard.zero_output_limit || DEFAULT_GUARD.zero_output_limit);
        if (shouldAlert) {
          const reason =
            level !== "safe" ? `context-${level}` : zeroLoop.count > 0 ? "zero-output-loop" : "soft-budget";
          const eventTime = new Date();
          const alert: Alert = {
            launcher,
            reason,
            session_id: session.id,
            directory: session.directory,
            input_tokens: stats.inputTokens,
            max_input_tokens: maxInputTokens,
            base_max_input_tokens: baseMaxInputTokens,
            strategy_context_budget_tokens: softBudgetTokens,
            zero_output_steps: zeroLoop.count,
            latest_finish: zeroLoop.latestFinish,
            time: eventTime.toISOString(),
            local_time: formatLocalTime(eventTime),
            continue_command: `${launcher} ${strategy?.profile ?? "coding"} --relay ${session.id}`,
            recommendation:
              level === "blocked" || zeroLoop.count >= (guard.zero_output_limit || DEFAULT_GUARD.zero_output_limit)
                ? `运行 ${launcher} ${strategy?.profile ?? "coding"} --relay ${session.id} 新开干净会话继续。`
                : "尽快 /compact，或在任务边界新开会话。",
          };
          if (strategy?.profile) alert.profile = strategy.profile;
          const warningKey = `${session.id}:${reason}:${stats.inputTokens}:${zeroLoop.count}`;
          writeAlert(alertPath, alert);
          if (warningKey !== state.warnedKey) {
            state.warnedKey = warningKey;
            writeHistory(historyDir, alert);
            console.warn(
              `[context-guard] ${alert.reason}: ${alert.session_id} input=${alert.input_tokens}/${alert.max_input_tokens} zero_output=${alert.zero_output_steps}`,
            );
          }
          if (shouldStop(guard, level, zeroLoop)) {
            stopProcessTree(parentPid);
            return true;
          }
        }
      }
    } catch (error) {
      const eventTime = new Date();
      writeAlert(alertPath, {
        launcher,
        reason: "watch-error",
        error: error instanceof Error ? error.message : String(error),
        time: eventTime.toISOString(),
        local_time: formatLocalTime(eventTime),
      });
    }
    await sleep(intervalMs);
  }
}

function writeSessionClosedHistory(launcher: string, alertPath: string, historyDir: string, state: WatchState): void {
  if (state.closed || !state.boundSessionId) return;
  state.closed = true;
  const eventTime = new Date();
  const alert: Alert = {
    launcher,
    reason: "session-closed",
    session_id: state.boundSessionId,
    time: eventTime.toISOString(),
    local_time: formatLocalTime(eventTime),
    recommendation: "关联 session 已关闭，context guard watcher 已正常退出。",
  };
  writeAlert(alertPath, alert);
  writeHistory(historyDir, alert);
  console.warn(`[context-guard] session-closed: ${state.boundSessionId} watcher stopped`);
}

function writeAlert(path: string, alert: Alert): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(alert, null, 2)}\n`, "utf8");
}

function writeHistory(dir: string, alert: Alert): void {
  mkdirSync(dir, { recursive: true });
  const eventTime = new Date(alert.time);
  const stamp = `${formatCompactTime(eventTime, true)}-${formatCompactTime(eventTime, false)}`;
  const baseName = `${stamp}_${safeName(alert.reason)}_${safeName(alert.session_id ?? "unknown")}`;
  const jsoncPath = join(dir, `${baseName}.jsonc`);
  writeFileSync(jsoncPath, historyJsonc(alert), "utf8");
}

function historyJsonc(alert: Alert): string {
  const record = {
    session_id: alert.session_id,
    continue_command: alert.continue_command,
    reason: alert.reason,
    local_time: alert.local_time ?? formatLocalTime(new Date(alert.time)),
    utc_time: alert.time,
    directory: alert.directory,
    profile: alert.profile,
    launcher: alert.launcher,
    input_tokens: alert.input_tokens,
    max_input_tokens: alert.max_input_tokens,
    base_max_input_tokens: alert.base_max_input_tokens,
    strategy_context_budget_tokens: alert.strategy_context_budget_tokens,
    zero_output_steps: alert.zero_output_steps,
    latest_finish: alert.latest_finish,
    recommendation: alert.recommendation,
  };
  return (
    `// Context Guard Event\n` +
    `// 用于熔断后人工辨认 session，也可供支持 JSONC 的工具解析。\n` +
    `// 继续命令：${alert.continue_command}\n\n` +
    `${JSON.stringify(record, null, 2)}\n`
  );
}

function safeName(value: string): string {
  return (value || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120);
}

function formatCompactTime(date: Date, utc = false): string {
  const values = utc
    ? [
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
      ]
    : [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return `${values[0]}${values
    .slice(1)
    .map((value) => String(value).padStart(2, "0"))
    .join("")}`;
}

function formatLocalTime(date: Date): string {
  const compact = formatCompactTime(date, false);
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)} ${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}`;
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_GUARD,
  readGuardConfig,
  readStrategyConfig,
  readMaxInputTokens,
  strategyBudgetTokens,
} from "./config.mjs";
import { findLatestSessionForDirectory, inspectSession, inspectZeroOutputLoop } from "./db.mjs";
import { riskLevel, shouldStop } from "./risk.mjs";
import { processAlive, sleep, stopProcessTree } from "./process.mjs";

export async function watch(args) {
  const [launcher, configPath, guardConfigPath, strategyPath, dbPath, cwd, parentPidValue] = args;
  if (!launcher || !configPath || !guardConfigPath || !strategyPath || !dbPath || !cwd) {
    return false;
  }

  const guard = readGuardConfig(guardConfigPath);
  if (!guard.enabled) process.exit(0);

  const baseMaxInputTokens = readMaxInputTokens(configPath);
  const strategy = readStrategyConfig(strategyPath);
  const maxInputTokens = baseMaxInputTokens;
  const softBudgetTokens = strategyBudgetTokens(strategy);
  const intervalMs = Math.max(1000, Number(guard.watch_interval_ms) || DEFAULT_GUARD.watch_interval_ms);
  const parentPid = Number(parentPidValue) || 0;
  const alertPath = resolve(cwd, guard.alert_file || DEFAULT_GUARD.alert_file);
  const historyDir = resolve(cwd, guard.history_dir || DEFAULT_GUARD.history_dir);
  const state = { lastSessionId: undefined, warnedKey: undefined, startedAt: Date.now() };

  while (true) {
    if (parentPid > 0 && !processAlive(parentPid)) process.exit(0);
    try {
      const session = findLatestSessionForDirectory(dbPath, cwd, state.startedAt);
      if (session) {
        const stats = inspectSession(dbPath, session.id);
        const zeroLoop = inspectZeroOutputLoop(dbPath, session.id, state.startedAt);
        const level = riskLevel(stats.inputTokens, maxInputTokens, guard);
        const softBudgetExceeded = softBudgetTokens > 0 && stats.inputTokens >= softBudgetTokens;
        const shouldAlert =
          level !== "safe" ||
          softBudgetExceeded ||
          zeroLoop.count >= (Number(guard.zero_output_limit) || DEFAULT_GUARD.zero_output_limit);
        if (shouldAlert) {
          const reason =
            level !== "safe" ? `context-${level}` : zeroLoop.count > 0 ? "zero-output-loop" : "soft-budget";
          const eventTime = new Date();
          const alert = {
            launcher,
            reason,
            session_id: session.id,
            directory: session.directory,
            profile: strategy?.profile,
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
              level === "blocked" ||
              zeroLoop.count >= (Number(guard.zero_output_limit) || DEFAULT_GUARD.zero_output_limit)
                ? `运行 ${launcher} ${strategy?.profile ?? "coding"} --relay ${session.id} 新开干净会话继续。`
                : "尽快 /compact，或在任务边界新开会话。",
          };
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
            process.exit(10);
          }
        }
        state.lastSessionId = session.id;
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

function writeAlert(path, alert) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(alert, null, 2)}\n`, "utf8");
}

function writeHistory(dir, alert) {
  mkdirSync(dir, { recursive: true });
  const eventTime = new Date(alert.time);
  const stamp = `${formatCompactTime(eventTime, true)}-${formatCompactTime(eventTime, false)}`;
  const baseName = `${stamp}_${safeName(alert.reason)}_${safeName(alert.session_id)}`;
  const jsoncPath = join(dir, `${baseName}.jsonc`);
  writeFileSync(jsoncPath, historyJsonc(alert), "utf8");
}

function historyJsonc(alert) {
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

function safeName(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120);
}

function formatCompactTime(date, utc = false) {
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
  return `${values[0]}${values.slice(1).map((value) => String(value).padStart(2, "0")).join("")}`;
}

function formatLocalTime(date) {
  const compact = formatCompactTime(date, false);
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)} ${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}`;
}

#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";

const DEFAULT_GUARD = {
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
};

const [, , command, ...args] = process.argv;

try {
  if (command === "check") process.exit(check(args));
  if (command === "rescue") process.exit(rescue(args));
  if (command === "handoff") process.exit(handoff(args));
  if (command === "watch") await watch(args);
  usage();
  process.exit(2);
} catch (error) {
  console.error(`context guard failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

function check(args) {
  const [launcher, configPath, guardConfigPath, dbPath, ...openCodeArgs] = splitArgs(args);
  const guard = readGuardConfig(guardConfigPath);
  if (!guard.enabled) return 0;

  const sessionId = findResumeSession(openCodeArgs);
  if (!sessionId) return 0;

  const maxInputTokens = readMaxInputTokens(configPath);
  const force = openCodeArgs.includes("--force");
  const stats = inspectSession(dbPath, sessionId);
  if (stats.inputTokens <= 0) {
    console.warn("[context-guard] 未能读取会话 token，已跳过恢复前检查。");
    return 0;
  }

  const ratio = stats.inputTokens / maxInputTokens;
  const level = riskLevel(stats.inputTokens, maxInputTokens, guard);
  if (level === "safe") return 0;

  printRisk(level, launcher, sessionId, stats, maxInputTokens, guard);
  if (guard.diagnostics) printDiagnostics(stats);

  if (level === "blocked" && !force) return 10;
  if (level === "danger" && ratio >= guard.block_ratio && !force) return 10;
  return 0;
}

async function watch(args) {
  const [launcher, configPath, guardConfigPath, strategyPath, dbPath, cwd, parentPidValue] = args;
  if (!launcher || !configPath || !guardConfigPath || !strategyPath || !dbPath || !cwd) {
    usage();
    process.exit(2);
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
          const reason = level !== "safe" ? `context-${level}` : zeroLoop.count > 0 ? "zero-output-loop" : "soft-budget";
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
            time: new Date().toISOString(),
            continue_command: `${launcher} ${strategy?.profile ?? "coding"} --relay ${session.id}`,
            recommendation:
              level === "blocked" || zeroLoop.count >= (Number(guard.zero_output_limit) || DEFAULT_GUARD.zero_output_limit)
                ? `运行 ${launcher} ${strategy?.profile ?? "coding"} --relay ${session.id} 新开干净会话继续。`
                : "尽快 /compact，或在任务边界新开会话。",
          };
          const warningKey = `${session.id}:${reason}:${stats.inputTokens}:${zeroLoop.count}`;
          writeAlert(alertPath, alert);
          if (warningKey !== state.warnedKey) {
            state.warnedKey = warningKey;
            console.warn(`[context-guard] ${alert.reason}: ${alert.session_id} input=${alert.input_tokens}/${alert.max_input_tokens} zero_output=${alert.zero_output_steps}`);
          }
          if (shouldStop(guard, level, zeroLoop)) {
            stopProcessTree(parentPid);
            process.exit(10);
          }
        }
        state.lastSessionId = session.id;
      }
    } catch (error) {
      writeAlert(alertPath, {
        launcher,
        reason: "watch-error",
        error: error instanceof Error ? error.message : String(error),
        time: new Date().toISOString(),
      });
    }
    await sleep(intervalMs);
  }
}

function rescue(args) {
  const [launcher, sessionId, guardConfigPath, dbPath] = args;
  if (!launcher || !sessionId || !guardConfigPath || !dbPath) {
    usage();
    return 2;
  }

  const guard = readGuardConfig(guardConfigPath);
  const messages = readSessionMessages(dbPath, sessionId);
  if (messages.length === 0) {
    console.error(`未找到 session：${sessionId}`);
    return 1;
  }

  const stats = summarizeMessages(messages);
  const summary = buildRescueSummary(sessionId, messages, stats);
  const outputDir = resolve(process.cwd(), guard.rescue_dir || DEFAULT_GUARD.rescue_dir);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${sanitizeFileName(sessionId)}.md`);
  writeFileSync(outputPath, summary, "utf8");

  console.log(`已生成救援摘要：${outputPath}`);
  console.log("建议新开干净会话后粘贴该摘要，或先阅读摘要再继续：");
  console.log(`  ${launcher}`);
  return 0;
}

function handoff(args) {
  const [launcher, sessionId, guardConfigPath, dbPath, cwd = process.cwd()] = args;
  if (!launcher || !sessionId || !guardConfigPath || !dbPath) {
    usage();
    return 2;
  }

  const guard = readGuardConfig(guardConfigPath);
  const messages = readSessionMessages(dbPath, sessionId);
  const session = readSession(dbPath, sessionId);
  if (!session && messages.length === 0) {
    console.error(`未找到 session：${sessionId}`);
    return 1;
  }

  const stats = summarizeMessages(messages);
  const outputDir = resolve(cwd, ".opencode", "handoff");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${sanitizeFileName(sessionId)}.md`);
  const rescueOutputDir = resolve(cwd, guard.rescue_dir || DEFAULT_GUARD.rescue_dir);
  mkdirSync(rescueOutputDir, { recursive: true });
  const rescueOutputPath = join(rescueOutputDir, `${sanitizeFileName(sessionId)}.md`);
  const rescueSummary = buildRescueSummary(sessionId, messages, stats);
  writeFileSync(rescueOutputPath, rescueSummary, "utf8");
  writeFileSync(outputPath, buildHandoffSummary(launcher, sessionId, session, stats, cwd, rescueOutputPath), "utf8");

  console.log(outputPath);
  return 0;
}

function splitArgs(args) {
  const marker = args.indexOf("--");
  if (marker < 0) return args;
  return [...args.slice(0, marker), ...args.slice(marker + 1)];
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function readGuardConfig(path) {
  return { ...DEFAULT_GUARD, ...readJson(path, {}) };
}

function readStrategyConfig(path) {
  return readJson(path, undefined);
}

function readMaxInputTokens(path) {
  const config = readJson(path, {});
  return Number(config?.max_input_tokens) || Number(config?.compaction?.max_input_tokens) || 120000;
}

function strategyBudgetTokens(strategy) {
  const values = [
    Number(strategy?.opencode?.dcp?.context_budget_tokens) || 0,
    Number(strategy?.oh_my_openagent?.dcp?.context_budget_tokens) || 0,
  ].filter((value) => value > 0);
  return values.length > 0 ? Math.min(...values) : 0;
}

function findResumeSession(args) {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === "-s" || args[index] === "--resume") return args[index + 1];
  }
  return undefined;
}

function riskLevel(inputTokens, maxInputTokens, guard) {
  if (inputTokens >= guard.absolute_block_tokens) return "blocked";
  const ratio = inputTokens / maxInputTokens;
  if (ratio >= guard.block_ratio) return "blocked";
  if (ratio >= guard.danger_ratio) return "danger";
  if (ratio >= guard.warn_ratio) return "warning";
  return "safe";
}

function inspectSession(dbPath, sessionId) {
  const messages = readSessionMessages(dbPath, sessionId);
  const tokenRow = queryOne(
    dbPath,
    "select json_extract(data, '$.tokens.input') as input from message where session_id = ? and json_extract(data, '$.role') = 'assistant' and coalesce(json_extract(data, '$.tokens.input'), 0) > 0 order by time_created desc limit 1",
    sessionId,
  );
  const stats = summarizeMessages(messages);
  return { ...stats, inputTokens: Number(tokenRow?.input) || 0 };
}

function findLatestSessionForDirectory(dbPath, cwd, sinceTimeUpdated) {
  const normalizedCwd = normalizePath(cwd);
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        "select id, directory, time_updated from session where directory is not null and time_updated >= ? order by time_updated desc limit 50",
      )
      .all(sinceTimeUpdated);
    return rows.find((row) => normalizePath(row.directory) === normalizedCwd);
  } finally {
    db.close();
  }
}

function inspectZeroOutputLoop(dbPath, sessionId, sinceTimeCreated) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        "select time_created, json_extract(data, '$.tokens.input') as input, json_extract(data, '$.tokens.output') as output, json_extract(data, '$.finish') as finish from message where session_id = ? and json_extract(data, '$.role') = 'assistant' and time_created >= ? order by time_created desc limit 12",
      )
      .all(sessionId, sinceTimeCreated);
    let count = 0;
    let latestFinish = undefined;
    for (const row of rows) {
      const input = Number(row.input) || 0;
      const output = Number(row.output) || 0;
      latestFinish ??= row.finish;
      if (input <= 0) continue;
      if (input > 0 && output === 0) count += 1;
      else break;
    }
    return { count, latestFinish };
  } finally {
    db.close();
  }
}

function writeAlert(path, alert) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(alert, null, 2)}\n`, "utf8");
}

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldStop(guard, level, zeroLoop) {
  if ((guard.watch_action || DEFAULT_GUARD.watch_action) !== "stop") return false;
  const zeroOutputLimit = Number(guard.zero_output_limit) || DEFAULT_GUARD.zero_output_limit;
  return level === "blocked" || zeroLoop.count >= zeroOutputLimit;
}

function stopProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill.exe", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

function queryOne(dbPath, sql, value) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.query(sql).get(value);
  } finally {
    db.close();
  }
}

function readSession(dbPath, sessionId) {
  return queryOne(
    dbPath,
    "select id, title, directory, time_created, time_updated from session where id = ?",
    sessionId,
  );
}

function readSessionMessages(dbPath, sessionId) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query("select data, time_created from message where session_id = ? order by time_created asc")
      .all(sessionId)
      .map((row) => ({ data: parseMessage(row.data), timeCreated: row.time_created }))
      .filter((row) => row.data);
  } finally {
    db.close();
  }
}

function parseMessage(value) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return undefined;
  }
}

function summarizeMessages(messages) {
  const texts = messages.map((message) => messageText(message.data));
  const toolResults = messages.filter((message) => /tool|result/i.test(JSON.stringify(message.data).slice(0, 2000)));
  const largeMessages = texts.filter((text) => text.length > 20000);
  const autoSlashBlocks = texts.filter((text) => text.includes("<auto-slash-command>")).length;
  const diffBlocks = texts.filter((text) => /diff --git|@@ /.test(text)).length;
  const commandOutputBlocks = texts.filter((text) =>
    /(npm|bun|pnpm|git|pytest|tsc|eslint).*(error|failed|warning|passed|found)/i.test(text),
  ).length;
  const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
  const toolChars = toolResults.reduce((sum, message) => sum + messageText(message.data).length, 0);
  return {
    inputTokens: 0,
    messageCount: messages.length,
    toolResultCount: toolResults.length,
    largeMessageCount: largeMessages.length,
    largestMessageChars: Math.max(0, ...texts.map((text) => text.length)),
    autoSlashBlocks,
    diffBlocks,
    commandOutputBlocks,
    noiseRatio: totalChars > 0 ? Math.round((toolChars / totalChars) * 100) : 0,
    totalChars,
  };
}

function messageText(value) {
  const parts = [];
  collectStrings(value, parts);
  return parts.join("\n");
}

function collectStrings(value, parts) {
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, parts);
    return;
  }
  for (const item of Object.values(value)) collectStrings(item, parts);
}

function printRisk(level, launcher, sessionId, stats, maxInputTokens, guard) {
  const ratio = Math.round((stats.inputTokens / maxInputTokens) * 100);
  const label = level === "blocked" ? "已阻止直接恢复" : level === "danger" ? "高风险" : "预警";
  console.warn(`\n[context-guard] ${label}：${sessionId}`);
  console.warn(`  input_tokens: ${stats.inputTokens} / ${maxInputTokens} (${ratio}%)`);
  if (level === "blocked") {
    console.warn("  为避免恢复后直接卡住，默认不进入该 session。");
    console.warn(`  推荐：${launcher} rescue ${sessionId}`);
    console.warn(`  如仍要强制恢复：${launcher} -s ${sessionId} --force`);
  } else {
    console.warn("  建议尽快 /compact，或使用 rescue 迁移到新会话。");
    if (stats.inputTokens >= guard.absolute_block_tokens) console.warn("  已超过绝对阻断线。程序将阻止恢复。");
  }
  console.warn("");
}

function printDiagnostics(stats) {
  console.warn("  上下文风险诊断：");
  console.warn(`    messages: ${stats.messageCount}`);
  console.warn(`    tool_results: ${stats.toolResultCount}`);
  console.warn(`    large_messages: ${stats.largeMessageCount}`);
  console.warn(`    largest_message_chars: ${stats.largestMessageChars}`);
  console.warn(`    auto_slash_command_blocks: ${stats.autoSlashBlocks}`);
  console.warn(`    diff_blocks: ${stats.diffBlocks}`);
  console.warn(`    command_output_blocks: ${stats.commandOutputBlocks}`);
  console.warn(`    likely_noise_ratio: ${stats.noiseRatio}%`);
  console.warn("");
}

function buildRescueSummary(sessionId, messages, stats) {
  const entries = messages.map((message) => ({
    role: message.data.role || "unknown",
    text: messageText(message.data),
  }));
  const userMessages = entries
    .filter((entry) => entry.role === "user")
    .slice(-20)
    .map((entry) => truncate(cleanText(entry.text), 1200));
  const assistantSummaries = entries
    .filter(
      (entry) =>
        entry.role === "assistant" &&
        /## (Goal|Done|Progress|Next Steps|Critical Context|Relevant Files)|目标|已完成|下一步/.test(entry.text),
    )
    .slice(-6)
    .map((entry) => truncate(cleanText(entry.text), 1800));
  const errorLines = uniqueLines(
    entries
      .flatMap((entry) => cleanText(entry.text).split("\n"))
      .filter((line) => /error|failed|exception|报错|失败|卡住/i.test(line)),
  ).slice(-30);
  const files = uniqueLines(
    entries.flatMap((entry) => cleanText(entry.text).match(/[A-Za-z]:\\[^\s`"']+|(?:[\w.-]+\/)+[\w.-]+/g) || []),
  ).slice(-60);
  const commands = uniqueLines(
    entries
      .flatMap((entry) => cleanText(entry.text).split("\n"))
      .filter((line) => /^\s*(bun|npm|pnpm|git|aiomo|aioc|opencode|tsc|eslint|pytest)\b/.test(line)),
  ).slice(-40);

  return (
    `# OpenCode Session Rescue\n\n` +
    `## Session\n${sessionId}\n\n` +
    `## Goal\n从旧会话迁移关键上下文，避免直接恢复超长 session 导致模型调用卡住。\n\n` +
    `## Recent User Requests\n${bulletList(userMessages)}\n\n` +
    `## Existing Summaries\n${bulletList(assistantSummaries)}\n\n` +
    `## Errors And Blockers\n${bulletList(errorLines)}\n\n` +
    `## Relevant Files\n${bulletList(files)}\n\n` +
    `## Commands Mentioned\n${bulletList(commands)}\n\n` +
    `## Context Diagnostics\n` +
    `- messages: ${stats.messageCount}\n` +
    `- tool_results: ${stats.toolResultCount}\n` +
    `- large_messages: ${stats.largeMessageCount}\n` +
    `- largest_message_chars: ${stats.largestMessageChars}\n` +
    `- auto_slash_command_blocks: ${stats.autoSlashBlocks}\n` +
    `- diff_blocks: ${stats.diffBlocks}\n` +
    `- command_output_blocks: ${stats.commandOutputBlocks}\n` +
    `- likely_noise_ratio: ${stats.noiseRatio}%\n\n` +
    `## Next Step\n新开一个干净会话，把本摘要作为初始上下文；不要直接恢复原 session，除非使用 --force 明确接受卡住风险。\n`
  );
}

function buildHandoffSummary(launcher, sessionId, session, stats, cwd, rescuePath) {
  const projectStateFiles = [
    ".sisyphus/boulder.json",
    ".sisyphus/plans/ai-workbench-mvp.md",
    ".sisyphus/notepads/ai-workbench-mvp/issues.md",
    ".sisyphus/notepads/ai-workbench-mvp/learnings.md",
  ].filter((file) => existsSync(resolve(cwd, file)));
  const title = session?.title ? String(session.title) : "unknown";
  const directory = session?.directory ? String(session.directory) : cwd;
  return (
    `# OpenCode Handoff\n\n` +
    `## Source Session\n` +
    `- id: ${sessionId}\n` +
    `- title: ${title}\n` +
    `- directory: ${directory}\n` +
    `- launcher: ${launcher}\n\n` +
    `## Reason\n` +
    `旧会话上下文过长或存在空输出风险。本文件用于新开干净 session 后继续工作，不恢复旧聊天历史。\n\n` +
    `## Diagnostics\n` +
    `- messages: ${stats.messageCount}\n` +
    `- tool_results: ${stats.toolResultCount}\n` +
    `- likely_noise_ratio: ${stats.noiseRatio}%\n` +
    `- rescue_summary: ${rescuePath}\n\n` +
    `## Project State Files\n` +
    `${bulletList(projectStateFiles)}\n\n` +
    `## Continue Instruction\n` +
    `请不要恢复旧 OpenCode session，也不要读取旧聊天历史。先读取本 handoff 文件和上面的 Project State Files，从 .sisyphus 恢复当前计划进度，按顺序持续推进未完成任务。每完成一个任务都更新状态、笔记和证据；如果上下文明显变长、接近上限、连续失败、验证被环境阻塞、需要重大决策，或者继续会降低质量，就停下来总结。不要运行 /start-work。\n`
  );
}

function cleanText(value) {
  return value
    .replace(/<auto-slash-command>[\s\S]*?<\/auto-slash-command>/g, "[auto-slash-command omitted]")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}... [truncated]` : value;
}

function bulletList(items) {
  if (items.length === 0) return "- (none)";
  return items.map((item) => `- ${item.replace(/\n/g, "\n  ")}`).join("\n");
}

function uniqueLines(lines) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

function sanitizeFileName(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function usage() {
  console.error("Usage:");
  console.error("  opencode-context-guard.mjs check <launcher> <config> <guard-config> <db> -- <opencode args...>");
  console.error("  opencode-context-guard.mjs rescue <launcher> <session-id> <guard-config> <db>");
  console.error("  opencode-context-guard.mjs handoff <launcher> <session-id> <guard-config> <db> <cwd>");
  console.error("  opencode-context-guard.mjs watch <launcher> <config> <guard-config> <strategy-config> <db> <cwd> <parent-pid>");
}

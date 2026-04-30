#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";

const DEFAULT_GUARD = {
  enabled: true,
  warn_ratio: 0.5,
  danger_ratio: 0.75,
  block_ratio: 0.9,
  absolute_block_tokens: 180000,
  rescue_dir: ".opencode-rescue",
  diagnostics: true,
};

const [, , command, ...args] = process.argv;

try {
  if (command === "check") process.exit(check(args));
  if (command === "rescue") process.exit(rescue(args));
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

function readMaxInputTokens(path) {
  const config = readJson(path, {});
  return Number(config?.max_input_tokens) || Number(config?.compaction?.max_input_tokens) || 120000;
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
    "select json_extract(data, '$.tokens.input') as input from message where session_id = ? and json_extract(data, '$.role') = 'assistant' order by time_created desc limit 1",
    sessionId,
  );
  const stats = summarizeMessages(messages);
  return { ...stats, inputTokens: Number(tokenRow?.input) || 0 };
}

function queryOne(dbPath, sql, value) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.query(sql).get(value);
  } finally {
    db.close();
  }
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
}

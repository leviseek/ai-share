import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePath } from "./process.mjs";

export function summarizeMessages(messages) {
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

export function buildRescueSummary(sessionId, messages, stats, ignore = []) {
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
  )
    .filter((file) => !isIgnoredPath(file, ignore))
    .slice(-60);
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

export function buildHandoffSummary(launcher, sessionId, session, stats, cwd, rescuePath, ignore = []) {
  const projectStateFiles = [
    ".sisyphus/boulder.json",
    ".sisyphus/plans/ai-workbench-mvp.md",
    ".sisyphus/notepads/ai-workbench-mvp/issues.md",
    ".sisyphus/notepads/ai-workbench-mvp/learnings.md",
  ].filter((file) => existsSync(resolve(cwd, file)));
  const visibleIgnore = ignore.slice(0, 80);
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
    `## Workspace Ignore\n` +
    `${bulletList(visibleIgnore)}\n\n` +
    `## Continue Instruction\n` +
    `请不要恢复旧 OpenCode session，也不要读取旧聊天历史。先读取本 handoff 文件和上面的 Project State Files，从 .sisyphus 恢复当前计划进度，按顺序持续推进未完成任务。读取、搜索和总结项目时遵守 Workspace Ignore，避免把依赖、构建产物、本地状态、证据日志和密钥文件带入上下文。每完成一个任务都更新状态、笔记和证据；如果上下文明显变长、接近上限、连续失败、验证被环境阻塞、需要重大决策，或者继续会降低质量，就停下来总结。不要运行 /start-work。\n`
  );
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

function isIgnoredPath(path, ignore) {
  const normalized = normalizePath(path).replace(/^[a-z]:\//, "");
  return ignore.some((pattern) => globLikeMatch(normalized, normalizePath(pattern)));
}

function globLikeMatch(path, pattern) {
  if (!pattern) return false;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3).replace(/\/+$/, "");
    return path === prefix || path.includes(`/${prefix}/`) || path.startsWith(`${prefix}/`);
  }
  if (pattern.startsWith("*.")) return path.endsWith(pattern.slice(1));
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2).replace(/\/+$/, "");
    return path.startsWith(`${prefix}/`) || path.includes(`/${prefix}/`);
  }
  return path === pattern || path.endsWith(`/${pattern}`);
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

export function bulletList(items) {
  if (items.length === 0) return "- (none)";
  return items.map((item) => `- ${item.replace(/\n/g, "\n  ")}`).join("\n");
}

function uniqueLines(lines) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

export function sanitizeFileName(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

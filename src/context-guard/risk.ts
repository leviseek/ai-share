import { DEFAULT_GUARD, type GuardConfig } from "./config.ts";
import type { MessageStats } from "./text-summary.ts";

export type RiskLevel = "safe" | "warning" | "danger" | "blocked";
export type ZeroOutputLoop = { count: number; latestFinish: unknown };

export function riskLevel(inputTokens: number, maxInputTokens: number, guard: GuardConfig): RiskLevel {
  if (inputTokens >= guard.absolute_block_tokens) return "blocked";
  const ratio = inputTokens / maxInputTokens;
  if (ratio >= guard.block_ratio) return "blocked";
  if (ratio >= guard.danger_ratio) return "danger";
  if (ratio >= guard.warn_ratio) return "warning";
  return "safe";
}

export function printRisk(
  level: RiskLevel,
  launcher: string,
  sessionId: string,
  stats: MessageStats,
  maxInputTokens: number,
  guard: GuardConfig,
  force = false,
): void {
  const ratio = Math.round((stats.inputTokens / maxInputTokens) * 100);
  const label =
    force && level === "blocked"
      ? "强制恢复高风险 session"
      : level === "blocked"
        ? "已阻止直接恢复"
        : level === "danger"
          ? "高风险"
          : "预警";
  console.warn(`\n[context-guard] ${label}：${sessionId}`);
  console.warn(`  input_tokens: ${stats.inputTokens} / ${maxInputTokens} (${ratio}%)`);
  if (force && level === "blocked") {
    console.warn("  已检测到 --force，将跳过恢复前阻断；仍建议优先使用 rescue 迁移到新会话。");
    console.warn(`  推荐：${launcher} rescue ${sessionId}`);
  } else if (level === "blocked") {
    console.warn("  为避免恢复后直接卡住，默认不进入该 session。");
    console.warn(`  推荐：${launcher} rescue ${sessionId}`);
    console.warn(`  如仍要强制恢复：${launcher} -s ${sessionId} --force`);
  } else {
    console.warn("  建议尽快 /compact，或使用 rescue 迁移到新会话。");
    if (stats.inputTokens >= guard.absolute_block_tokens) console.warn("  已超过绝对阻断线。程序将阻止恢复。");
  }
  console.warn("");
}

export function printDiagnostics(stats: MessageStats): void {
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

export function shouldStop(guard: GuardConfig, level: RiskLevel, zeroLoop: ZeroOutputLoop): boolean {
  if ((guard.watch_action || DEFAULT_GUARD.watch_action) !== "stop") return false;
  const zeroOutputLimit = guard.zero_output_limit || DEFAULT_GUARD.zero_output_limit;
  return level === "blocked" || zeroLoop.count >= zeroOutputLimit;
}

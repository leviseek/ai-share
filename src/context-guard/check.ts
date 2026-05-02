import { readGuardConfig, readMaxInputTokens } from "./config.ts";
import { inspectSession } from "./db.ts";
import { printDiagnostics, printRisk, riskLevel } from "./risk.ts";

export function check(args: string[]): number {
  const [launcher, configPath, guardConfigPath, dbPath, ...openCodeArgs] = splitArgs(args);
  if (!launcher || !configPath || !guardConfigPath || !dbPath) return 2;
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

function splitArgs(args: string[]): string[] {
  const marker = args.indexOf("--");
  if (marker < 0) return args;
  return [...args.slice(0, marker), ...args.slice(marker + 1)];
}

function findResumeSession(args: string[]): string | undefined {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === "-s" || args[index] === "--resume") return args[index + 1];
  }
  return undefined;
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_GUARD, readGuardConfig, readStrategyConfig, workspaceIgnore } from "./config.mjs";
import { readSession, readSessionMessages } from "./db.mjs";
import { buildHandoffSummary, buildRescueSummary, sanitizeFileName, summarizeMessages } from "./text-summary.mjs";

export function handoff(args) {
  const [launcher, sessionId, guardConfigPath, dbPath, cwd = process.cwd()] = args;
  if (!launcher || !sessionId || !guardConfigPath || !dbPath) {
    return false;
  }

  const guard = readGuardConfig(guardConfigPath);
  const strategy = readStrategyConfig(resolve(dirname(guardConfigPath), "strategy.json"));
  const ignore = workspaceIgnore(strategy);
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
  const rescueSummary = buildRescueSummary(sessionId, messages, stats, ignore);
  writeFileSync(rescueOutputPath, rescueSummary, "utf8");
  writeFileSync(
    outputPath,
    buildHandoffSummary(launcher, sessionId, session, stats, cwd, rescueOutputPath, ignore),
    "utf8",
  );

  console.log(outputPath);
  return 0;
}

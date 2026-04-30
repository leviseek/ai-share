import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_GUARD, readGuardConfig, readStrategyConfig, workspaceIgnore } from "./config.mjs";
import { readSessionMessages } from "./db.mjs";
import { buildRescueSummary, sanitizeFileName, summarizeMessages } from "./text-summary.mjs";

export function rescue(args) {
  const [launcher, sessionId, guardConfigPath, dbPath] = args;
  if (!launcher || !sessionId || !guardConfigPath || !dbPath) {
    return false;
  }

  const guard = readGuardConfig(guardConfigPath);
  const strategy = readStrategyConfig(resolve(dirname(guardConfigPath), "strategy.json"));
  const messages = readSessionMessages(dbPath, sessionId);
  if (messages.length === 0) {
    console.error(`未找到 session：${sessionId}`);
    return 1;
  }

  const stats = summarizeMessages(messages);
  const summary = buildRescueSummary(sessionId, messages, stats, workspaceIgnore(strategy));
  const outputDir = resolve(process.cwd(), guard.rescue_dir || DEFAULT_GUARD.rescue_dir);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${sanitizeFileName(sessionId)}.md`);
  writeFileSync(outputPath, summary, "utf8");

  console.log(`已生成救援摘要：${outputPath}`);
  console.log("建议新开干净会话后粘贴该摘要，或先阅读摘要再继续：");
  console.log(`  ${launcher}`);
  return 0;
}

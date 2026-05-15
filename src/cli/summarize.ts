#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readSessionMessages } from "../context-guard/db.ts";
import { buildRescueSummary, sanitizeFileName, summarizeMessages } from "../context-guard/text-summary.ts";

interface SummarizeArgs {
  sessionId: string;
  llm: boolean;
  dbPath: string;
  outputDir: string;
}

function parseArgs(args: string[]): SummarizeArgs | null {
  const sessionId = args[0];
  if (!sessionId) return null;

  const llm = args.includes("--llm");

  const dbIdx = args.indexOf("--db");
  let dbPath = defaultDbPath();
  if (dbIdx >= 0) {
    const next = args[dbIdx + 1];
    if (next) dbPath = next;
  }

  const outputIdx = args.indexOf("--output");
  let outputDir = ".opencode-rescue";
  if (outputIdx >= 0) {
    const next = args[outputIdx + 1];
    if (next) outputDir = next;
  }

  return { sessionId, llm, dbPath, outputDir };
}

function defaultDbPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".config", "opencode", "opencode.db");
}

function buildLlmPrompt(deterministicSummary: string): string {
  return `Summarize this OpenCode session concisely. Format:
## Goal — what was being worked on
## Progress — what was accomplished
## Key Decisions — architecture/approach decisions made
## Unresolved Issues — blockers, errors, pending items
## Relevant Files — files modified or discussed

Session data:
${deterministicSummary.slice(0, 30000)}`;
}

async function callLlm(prompt: string): Promise<string> {
  const proc = Bun.spawn(["opencode", "run", "--agent", "fast", prompt], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const killTimer = setTimeout(() => {
    proc.kill();
  }, 5000);

  try {
    const text = await new Response(proc.stdout).text();
    clearTimeout(killTimer);
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !text.trim()) {
      throw new Error(`LLM call failed with exit code ${exitCode}`);
    }
    return text.trim();
  } catch {
    clearTimeout(killTimer);
    proc.kill();
    throw new Error("LLM call timed out or failed");
  }
}

async function main(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (!parsed) {
    console.error("用法：aiomo summarize <session-id> [--llm] [--db <path>] [--output <dir>]");
    return 1;
  }

  const { sessionId, llm, dbPath, outputDir } = parsed;

  const messages = readSessionMessages(dbPath, sessionId);
  if (messages.length === 0) {
    console.error(`未找到 session：${sessionId}`);
    return 1;
  }

  const stats = summarizeMessages(messages);
  const deterministicSummary = buildRescueSummary(sessionId, messages, stats);

  const suffix = llm ? "-llm" : "";
  const outDir = resolve(process.cwd(), outputDir);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${sanitizeFileName(sessionId)}${suffix}.md`);

  if (!llm) {
    writeFileSync(outPath, deterministicSummary, "utf8");
    console.log(`已生成救援摘要：${outPath}`);
    return 0;
  }

  let finalOutput: string;
  try {
    const llmResponse = await callLlm(buildLlmPrompt(deterministicSummary));
    finalOutput = `# LLM-Enhanced Session Summary\n\n${llmResponse}\n\n---\n## Deterministic Fallback\n\n${deterministicSummary}`;
    console.log(`已生成 LLM 增强摘要：${outPath}`);
  } catch {
    finalOutput = `# LLM-Enhanced Session Summary (LLM UNAVAILABLE — deterministic fallback)\n\n${deterministicSummary}`;
    console.log(`LLM 调用失败，已回退到确定性摘要：${outPath}`);
  }

  writeFileSync(outPath, finalOutput, "utf8");
  return 0;
}

const exitCode = await main(Bun.argv.slice(2));
process.exit(exitCode);

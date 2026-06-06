#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type MemoryLintSeverity = "error" | "warning";

export type MemoryLintFinding = {
  severity: MemoryLintSeverity;
  path: string;
  message: string;
  line?: number;
};

export type MemoryLintOptions = {
  now?: Date;
};

type TextLine = {
  path: string;
  line: number;
  text: string;
};

const projectRoot = resolve(import.meta.dirname, "..", "..");
const duplicateTargetPrefixes = [
  "AI_GUIDELINES.md",
  "memory/user/",
  "memory/architecture/",
  "memory/stable/",
  "memory/policies/",
];

if (import.meta.main) {
  const findings = lintMemory(projectRoot);
  printMemoryLintFindings(findings);
  process.exit(findings.some((finding) => finding.severity === "error") ? 1 : 0);
}

export function lintMemory(root: string = projectRoot, options: MemoryLintOptions = {}): MemoryLintFinding[] {
  const files = lintTargetFiles(root);
  const findings: MemoryLintFinding[] = [];
  const duplicateLines: TextLine[] = [];
  const now = startOfUtcDay(options.now ?? new Date());

  for (const filePath of files) {
    const relPath = normalizePath(relative(root, filePath));
    const content = readFileSync(filePath, "utf8");
    const lines = content.replaceAll("\r\n", "\n").split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const lineNumber = index + 1;
      if (containsSecretLiteral(line)) {
        findings.push({
          severity: "error",
          path: relPath,
          line: lineNumber,
          message: "memory lint 检测到疑似明文 secret；请删除真实值或改为环境变量名。",
        });
      }

      const conflict = conflictMessage(line);
      if (conflict) {
        findings.push({
          severity: "error",
          path: relPath,
          line: lineNumber,
          message: conflict,
        });
      }

      const staleMessage = staleDateMessage(line, now);
      if (staleMessage) {
        findings.push({
          severity: "warning",
          path: relPath,
          line: lineNumber,
          message: staleMessage,
        });
      }

      if (shouldCheckDuplicates(relPath)) {
        const normalized = normalizeRuleLine(line);
        if (normalized) duplicateLines.push({ path: relPath, line: lineNumber, text: normalized });
      }
    }

    if (relPath.startsWith("memory/inferred/") && !hasReviewMetadata(content)) {
      findings.push({
        severity: "warning",
        path: relPath,
        message: "inferred memory 缺少 review_after、expires_at 或 stale_after 复核字段。",
      });
    }
  }

  findings.push(...duplicateFindings(duplicateLines));
  return sortFindings(findings);
}

function lintTargetFiles(root: string): string[] {
  const files = [];
  const guidelines = resolve(root, "AI_GUIDELINES.md");
  if (existsSync(guidelines)) files.push(guidelines);
  files.push(...listMemoryFiles(resolve(root, "memory")));
  return files.filter((filePath) => /\.(?:md|ya?ml)$/i.test(filePath) && !filePath.endsWith(`${sep}.gitkeep`));
}

function listMemoryFiles(memoryRoot: string): string[] {
  if (!existsSync(memoryRoot)) return [];

  const output: string[] = [];
  for (const entry of readdirSync(memoryRoot, { withFileTypes: true })) {
    const entryPath = resolve(memoryRoot, entry.name);
    if (entry.isDirectory()) {
      output.push(...listMemoryFiles(entryPath));
    } else if (entry.isFile()) {
      output.push(entryPath);
    }
  }
  return output;
}

function shouldCheckDuplicates(path: string): boolean {
  return duplicateTargetPrefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

function normalizeRuleLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!/^[-*]\s+/.test(trimmed)) return undefined;
  if (trimmed.includes("`") || /https?:\/\//i.test(trimmed)) return undefined;

  const normalized = trimmed
    .replace(/^[-*]\s+/, "")
    .replace(/[：:，,。；;、"'“”‘’()[\]{}<>]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

  return normalized.length >= 12 ? normalized : undefined;
}

function duplicateFindings(lines: readonly TextLine[]): MemoryLintFinding[] {
  const occurrences = new Map<string, TextLine[]>();
  for (const line of lines) {
    const existing = occurrences.get(line.text) ?? [];
    existing.push(line);
    occurrences.set(line.text, existing);
  }

  const findings: MemoryLintFinding[] = [];
  for (const [text, entries] of occurrences) {
    const paths = new Set(entries.map((entry) => entry.path));
    if (paths.size < 2) continue;

    const first = entries[0];
    if (!first) continue;
    findings.push({
      severity: "warning",
      path: first.path,
      line: first.line,
      message: `memory lint 检测到重复规则：${shortText(text)}；出现于 ${[...paths].sort().join(", ")}。`,
    });
  }
  return findings;
}

function conflictMessage(line: string): string | undefined {
  const normalized = line.replace(/\s+/g, "").toLowerCase();
  if (isNegated(normalized)) return undefined;

  if (/ai.*自动写入.*(?:stable|distilled|长期memory|长期记忆)/i.test(normalized)) {
    return "memory lint 检测到 AI 自动写入长期确认层的规则冲突；stable/distilled 需要人工确认。";
  }

  if (/(?:自动|主动)(?:commit|提交|push|推送)/i.test(normalized)) {
    return "memory lint 检测到自动 Git 操作规则冲突；提交和推送必须由用户明确要求。";
  }

  if (/(?:保存|写入|提交).*(?:真实密钥|明文secret|token|cookie|私钥)/i.test(normalized)) {
    return "memory lint 检测到敏感信息写入规则冲突；只能保存环境变量名或占位符。";
  }

  if (/(?:手改|直接修改).*(?:生成配置|生成产物|generated)/i.test(normalized)) {
    return "memory lint 检测到手改生成产物规则冲突；长期修复应修改权威源。";
  }

  if (/(?:删除测试|弱化断言|放宽类型|跳过lint|跳过typecheck|吞掉错误).*(?:通过|pass)/i.test(normalized)) {
    return "memory lint 检测到绕过验证规则冲突；不能通过弱化门禁制造通过。";
  }

  return undefined;
}

function isNegated(normalized: string): boolean {
  return /(?:不|不要|不得|禁止|never|donot|don't)/i.test(normalized);
}

function staleDateMessage(line: string, now: Date): string | undefined {
  const match = /^\s*(?:-\s*)?(expires_at|review_after|stale_after)\s*[:=]\s*["']?(\d{4}-\d{2}-\d{2}|null)/i.exec(line);
  if (!match) return undefined;

  const field = match[1] ?? "";
  const value = match[2] ?? "";
  if (value === "null") return undefined;

  const date = parseDate(value);
  if (!date || date >= now) return undefined;
  return `memory lint 检测到已过期复核字段：${field}=${value}。`;
}

function parseDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function hasReviewMetadata(content: string): boolean {
  return /(?:review_after|expires_at|stale_after)\s*[:=]/i.test(content);
}

function containsSecretLiteral(content: string): boolean {
  return /(?:^|[\s"'=:])(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]{20,}|SEC[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:$|[\s"',;])/m.test(
    content,
  );
}

function sortFindings(findings: readonly MemoryLintFinding[]): MemoryLintFinding[] {
  return [...findings].sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) return pathCompare;
    return (left.line ?? 0) - (right.line ?? 0);
  });
}

function shortText(text: string): string {
  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function printMemoryLintFindings(findings: readonly MemoryLintFinding[]): void {
  if (findings.length === 0) {
    console.log("memory lint passed.");
    return;
  }

  for (const finding of findings) {
    const prefix = finding.severity === "error" ? "ERROR" : "WARN";
    const location = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
    console.log(`${prefix} ${location}: ${finding.message}`);
  }
}

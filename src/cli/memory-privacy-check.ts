#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type MemoryPrivacyFinding = {
  severity: "error" | "warning";
  path: string;
  message: string;
  line?: number;
};

export type MemoryPrivacyCheckOptions = {
  checkGitTracking?: boolean;
};

type PrivacyLayer = "shareable" | "personal" | "ignored" | "review";
type PrivacyAllowKind = "secret" | "local-path" | "personal-data";

const projectRoot = resolve(import.meta.dirname, "..", "..");

const REQUIRED_GITIGNORE_PATTERNS = [
  "config/local/",
  "memory/local/",
  "memory/private/",
  "memory/project/",
  "memory/runtime/",
  "memory/sync/",
];

const SHAREABLE_PREFIXES = ["memory/architecture/", "memory/stack/", "memory/policies/"];
const PERSONAL_PREFIXES = ["memory/user/", "memory/stable/"];
const REVIEW_PREFIXES = ["memory/inferred/", "memory/distilled/"];
const IGNORED_PREFIXES = ["memory/local/", "memory/private/", "memory/project/", "memory/runtime/", "memory/sync/"];

if (import.meta.main) {
  const findings = checkMemoryPrivacy(projectRoot);
  printFindings(findings);
  process.exit(findings.some((finding) => finding.severity === "error") ? 1 : 0);
}

export function checkMemoryPrivacy(
  root: string = projectRoot,
  options: MemoryPrivacyCheckOptions = {},
): MemoryPrivacyFinding[] {
  const findings: MemoryPrivacyFinding[] = [];
  const allowCounts: Record<PrivacyAllowKind, number> = {
    secret: 0,
    "local-path": 0,
    "personal-data": 0,
  };
  checkRequiredGitignorePatterns(root, findings);
  if (options.checkGitTracking ?? true) checkIgnoredLayerTracking(root, findings);

  for (const filePath of listMemoryFiles(resolve(root, "memory"))) {
    const relPath = normalizePath(relative(root, filePath));
    if (relPath.endsWith("/.gitkeep")) continue;

    const layer = privacyLayer(relPath);
    if (!layer) {
      findings.push({
        severity: "error",
        path: relPath,
        message: "memory 文件未归入已声明的隐私层。",
      });
      continue;
    }

    if (layer === "ignored") continue;

    const content = readFileSync(filePath, "utf8");
    addPrivacyAllowCounts(allowCounts, content);
    for (const finding of scanMemoryContent(relPath, layer, content)) {
      findings.push(finding);
    }
  }

  const allowSummary = formatPrivacyAllowSummary(allowCounts);
  if (allowSummary) {
    findings.push({
      severity: "warning",
      path: "memory",
      message: `privacy allow 指令使用：${allowSummary}。请定期复核 allow 是否仍有必要。`,
    });
  }

  return findings;
}

function scanMemoryContent(path: string, layer: PrivacyLayer, content: string): MemoryPrivacyFinding[] {
  const findings: MemoryPrivacyFinding[] = [];
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    if (containsSecretLiteral(line) && !hasPrivacyAllow(line, "secret")) {
      findings.push({
        severity: "error",
        path,
        line: lineNumber,
        message: "memory 中疑似包含明文 secret；请改为环境变量名或删除。",
      });
    }

    if (layer === "shareable" && containsConcreteLocalPath(line) && !hasPrivacyAllow(line, "local-path")) {
      findings.push({
        severity: "error",
        path,
        line: lineNumber,
        message: "shareable memory 不应包含具体本机绝对路径；请改为 <repo>、<home> 或说明性占位符。",
      });
    }

    if (layer === "shareable" && containsPersonalIdentifier(line) && !hasPrivacyAllow(line, "personal-data")) {
      findings.push({
        severity: "warning",
        path,
        line: lineNumber,
        message:
          "shareable memory 疑似包含个人标识；如确需保留，请添加 ai-share-privacy-allow: personal-data -- reason。",
      });
    }
  }

  return findings;
}

function checkRequiredGitignorePatterns(root: string, findings: MemoryPrivacyFinding[]): void {
  const gitignorePath = resolve(root, ".gitignore");
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8").replaceAll("\\", "/") : "";
  for (const pattern of REQUIRED_GITIGNORE_PATTERNS) {
    if (!gitignore.includes(pattern)) {
      findings.push({
        severity: "error",
        path: ".gitignore",
        message: `缺少隐私层 ignore 规则：${pattern}`,
      });
    }
  }
}

function checkIgnoredLayerTracking(root: string, findings: MemoryPrivacyFinding[]): void {
  const result = spawnSync("git", ["ls-files", ...REQUIRED_GITIGNORE_PATTERNS], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    findings.push({
      severity: "warning",
      path: ".git",
      message: "无法确认 ignored memory 层是否被 Git 跟踪。",
    });
    return;
  }

  for (const path of result.stdout.split(/\r?\n/).filter(Boolean)) {
    findings.push({
      severity: "error",
      path,
      message: "隐私层路径不应被 Git 跟踪。",
    });
  }
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

function privacyLayer(path: string): PrivacyLayer | undefined {
  if (SHAREABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "shareable";
  if (PERSONAL_PREFIXES.some((prefix) => path.startsWith(prefix))) return "personal";
  if (REVIEW_PREFIXES.some((prefix) => path.startsWith(prefix))) return "review";
  if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) return "ignored";
  return undefined;
}

function containsSecretLiteral(content: string): boolean {
  return /(?:^|[\s"'=:])(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]{20,}|SEC[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:$|[\s"',;])/m.test(
    content,
  );
}

function containsConcreteLocalPath(content: string): boolean {
  return /(?:[A-Za-z]:\\(?!<)[^\s`"']+|\/Users\/(?!<user>)[^\s`"']+|\/home\/(?!<user>)[^\s`"']+)/.test(content);
}

function containsPersonalIdentifier(content: string): boolean {
  return /[A-Z0-9._%+-]+@(?!example\.com\b|example\.test\b)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content);
}

function hasPrivacyAllow(content: string, kind: PrivacyAllowKind): boolean {
  return extractPrivacyAllowKind(content) === kind;
}

function extractPrivacyAllowKind(content: string): PrivacyAllowKind | undefined {
  const match = /ai-share-privacy-allow:\s*([a-z-]+)\s*--\s*(.{8,})/i.exec(content);
  const kind = match?.[1]?.toLowerCase();
  return kind === "secret" || kind === "local-path" || kind === "personal-data" ? kind : undefined;
}

function addPrivacyAllowCounts(counts: Record<PrivacyAllowKind, number>, content: string): void {
  for (const line of content.replaceAll("\r\n", "\n").split("\n")) {
    const kind = extractPrivacyAllowKind(line);
    if (kind) counts[kind] += 1;
  }
}

function formatPrivacyAllowSummary(counts: Record<PrivacyAllowKind, number>): string | undefined {
  const entries = (["secret", "local-path", "personal-data"] as const).flatMap((kind) =>
    counts[kind] > 0 ? [`${kind}=${counts[kind]}`] : [],
  );
  return entries.length > 0 ? entries.join(", ") : undefined;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function printFindings(findings: readonly MemoryPrivacyFinding[]): void {
  if (findings.length === 0) {
    console.log("memory privacy check passed.");
    return;
  }

  for (const finding of findings) {
    const prefix = finding.severity === "error" ? "ERROR" : "WARN";
    const location = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
    console.log(`${prefix} ${location}: ${finding.message}`);
  }
}

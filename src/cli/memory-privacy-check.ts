#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type MemoryPrivacyFinding = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type MemoryPrivacyCheckOptions = {
  checkGitTracking?: boolean;
};

type PrivacyLayer = "shareable" | "personal" | "ignored" | "review";

const projectRoot = resolve(import.meta.dirname, "..", "..");

const REQUIRED_GITIGNORE_PATTERNS = [
  "config/local/",
  "memory/local/",
  "memory/private/",
  "memory/project/",
  "memory/runtime/",
  "memory/sync/",
];

const SHAREABLE_PREFIXES = ["memory/architecture/", "memory/stack/", "memory/profiles/", "memory/policies/"];
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
    if (containsSecretLiteral(content)) {
      findings.push({
        severity: "error",
        path: relPath,
        message: "memory 中疑似包含明文 secret；请改为环境变量名或删除。",
      });
    }

    if (layer === "shareable" && containsConcreteLocalPath(content)) {
      findings.push({
        severity: "error",
        path: relPath,
        message: "shareable memory 不应包含具体本机绝对路径；请改为 <repo>、<home> 或说明性占位符。",
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
    console.log(`${prefix} ${finding.path}: ${finding.message}`);
  }
}

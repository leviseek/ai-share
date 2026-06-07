#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

export type SkillLintSeverity = "error" | "warning";

export type SkillLintFinding = {
  severity: SkillLintSeverity;
  path: string;
  message: string;
  line?: number;
};

type SkillFrontmatter = {
  fields: Map<string, string>;
};

const projectRoot = resolve(import.meta.dirname, "..", "..");
const allowedFrontmatterFields = new Set(["name", "description"]);
const unnecessaryDocNames = new Set(["README.MD", "CHANGELOG.MD", "INSTALLATION_GUIDE.MD"]);

if (import.meta.main) {
  const findings = lintSkills(projectRoot);
  printSkillLintFindings(findings);
  process.exit(findings.some((finding) => finding.severity === "error") ? 1 : 0);
}

export function lintSkills(root: string = projectRoot): SkillLintFinding[] {
  const skillsRoot = resolve(root, "skills");
  if (!existsSync(skillsRoot)) return [];

  const findings: SkillLintFinding[] = [];
  for (const skillDir of listSkillDirs(skillsRoot)) {
    findings.push(...lintSkillDir(root, skillDir));
  }
  return sortFindings(findings);
}

function lintSkillDir(root: string, skillDir: string): SkillLintFinding[] {
  const findings: SkillLintFinding[] = [];
  const skillName = basename(skillDir);
  const skillPath = resolve(skillDir, "SKILL.md");
  const relSkillPath = normalizePath(relative(root, skillPath));

  if (!existsSync(skillPath)) {
    return [
      {
        severity: "error",
        path: relSkillPath,
        message: "skill lint 检测到缺失的 SKILL.md。",
      },
    ];
  }

  const content = readFileSync(skillPath, "utf8");
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const frontmatter = parseFrontmatter(lines);

  if (!frontmatter) {
    findings.push({
      severity: "error",
      path: relSkillPath,
      line: 1,
      message: "skill lint 检测到缺失或无效的 frontmatter。",
    });
  } else {
    findings.push(...lintFrontmatter(relSkillPath, skillName, frontmatter));
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (containsSecretLiteral(lines[index] ?? "")) {
      findings.push({
        severity: "error",
        path: relSkillPath,
        line: index + 1,
        message: "skill lint 检测到疑似明文 secret；请删除真实值或改为环境变量名。",
      });
    }
  }

  const description = frontmatter?.fields.get("description") ?? "";
  if (description.trim().length < 24 || !/\b(?:use|when|for|触发|用于|适用|asks?)\b/i.test(description)) {
    findings.push({
      severity: "warning",
      path: relSkillPath,
      message: "skill lint 检测到 description 过短或缺少明确触发语义。",
    });
  }

  if (!/^## Trigger Examples\b/im.test(content)) {
    findings.push({
      severity: "warning",
      path: relSkillPath,
      message: "skill lint 检测到缺少 Trigger Examples。",
    });
  }

  if (!/^## Anti Examples\b/im.test(content)) {
    findings.push({
      severity: "warning",
      path: relSkillPath,
      message: "skill lint 检测到缺少 Anti Examples。",
    });
  }

  if (lines.length > 500) {
    findings.push({
      severity: "warning",
      path: relSkillPath,
      message: "skill lint 检测到 SKILL.md 超过 500 行。",
    });
  }

  for (const docPath of unnecessaryDocs(skillDir)) {
    findings.push({
      severity: "warning",
      path: normalizePath(relative(root, docPath)),
      message: "skill lint 检测到 skill 目录包含非必要文档。",
    });
  }

  return findings;
}

function lintFrontmatter(relSkillPath: string, skillName: string, frontmatter: SkillFrontmatter): SkillLintFinding[] {
  const findings: SkillLintFinding[] = [];
  for (const field of ["name", "description"]) {
    if (!frontmatter.fields.has(field)) {
      findings.push({
        severity: "error",
        path: relSkillPath,
        line: 1,
        message: `skill lint 检测到 frontmatter 缺少 ${field}。`,
      });
    }
  }

  const declaredName = frontmatter.fields.get("name");
  if (declaredName !== undefined && declaredName !== skillName) {
    findings.push({
      severity: "error",
      path: relSkillPath,
      line: 1,
      message: "skill lint 检测到 frontmatter name 与目录名不一致。",
    });
  }

  for (const field of frontmatter.fields.keys()) {
    if (!allowedFrontmatterFields.has(field)) {
      findings.push({
        severity: "error",
        path: relSkillPath,
        line: 1,
        message: `skill lint 检测到不允许的 frontmatter 字段：${field}。`,
      });
    }
  }

  return findings;
}

function parseFrontmatter(lines: readonly string[]): SkillFrontmatter | undefined {
  if (lines[0] !== "---") return undefined;

  const fields = new Map<string, string>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === "---") return { fields };

    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2] ?? "";
    if (key) fields.set(key, unquoteYamlScalar(rawValue.trim()));
  }

  return undefined;
}

function listSkillDirs(skillsRoot: string): string[] {
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(skillsRoot, entry.name))
    .sort();
}

function unnecessaryDocs(skillDir: string): string[] {
  return readdirSync(skillDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && unnecessaryDocNames.has(entry.name.toUpperCase()))
    .map((entry) => resolve(skillDir, entry.name));
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function containsSecretLiteral(content: string): boolean {
  return /(?:^|[\s"'=:])(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]{20,}|SEC[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:$|[\s"',;])/m.test(
    content,
  );
}

function sortFindings(findings: readonly SkillLintFinding[]): SkillLintFinding[] {
  return [...findings].sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) return pathCompare;
    return (left.line ?? 0) - (right.line ?? 0);
  });
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function printSkillLintFindings(findings: readonly SkillLintFinding[]): void {
  if (findings.length === 0) {
    console.log("skill lint passed.");
    return;
  }

  for (const finding of findings) {
    const prefix = finding.severity === "error" ? "ERROR" : "WARN";
    const location = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
    console.log(`${prefix} ${location}: ${finding.message}`);
  }
}

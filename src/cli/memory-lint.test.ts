import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lintMemory } from "./memory-lint.ts";

describe("memory lint", () => {
  test("passes clean memory files", () => {
    const root = makeRoot();
    try {
      writeFile(root, "AI_GUIDELINES.md", "# Guidelines\n- 阅读上下文后再修改代码。\n");
      writeFile(root, "memory/user/profile.md", "# Profile\n- 偏好简体中文沟通。\n");

      expect(lintMemory(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports secret literals without exposing the secret value", () => {
    const root = makeRoot();
    try {
      const secret = "sk-1234567890abcdefghijkl";
      writeFile(root, "memory/user/profile.md", `token: ${secret}\n`);

      const findings = lintMemory(root);

      expect(findings).toContainEqual({
        severity: "error",
        path: "memory/user/profile.md",
        line: 1,
        message: "memory lint 检测到疑似明文 secret；请删除真实值或改为环境变量名。",
      });
      expect(JSON.stringify(findings)).not.toContain(secret);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports duplicate rules across memory files as warnings", () => {
    const root = makeRoot();
    try {
      writeFile(root, "memory/user/profile.md", "- 先理解项目上下文再修改目标文件\n");
      writeFile(root, "memory/user/prompts.md", "- 先理解项目上下文再修改目标文件\n");

      const findings = lintMemory(root);

      expect(findings.some((finding) => finding.severity === "warning" && finding.message.includes("重复规则"))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports conflicting durable-memory and git rules as errors", () => {
    const root = makeRoot();
    try {
      writeFile(root, "memory/policies/bad.md", "- AI 可自动写入 stable 长期记忆\n- 主动提交当前改动\n");

      const messages = lintMemory(root).map((finding) => finding.message);

      expect(messages).toContain("memory lint 检测到 AI 自动写入长期确认层的规则冲突；stable/distilled 需要人工确认。");
      expect(messages).toContain("memory lint 检测到自动 Git 操作规则冲突；提交和推送必须由用户明确要求。");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports stale review dates and inferred memory without review metadata", () => {
    const root = makeRoot();
    try {
      writeFile(root, "memory/stable/old.yaml", 'review_after: "2025-01-01"\n');
      writeFile(root, "memory/inferred/candidate.md", "# Candidate\nsource: ai-inferred\n");

      const findings = lintMemory(root, { now: new Date(Date.UTC(2026, 0, 1)) });

      expect(findings).toContainEqual({
        severity: "warning",
        path: "memory/stable/old.yaml",
        line: 1,
        message: "memory lint 检测到已过期复核字段：review_after=2025-01-01。",
      });
      expect(findings).toContainEqual({
        severity: "warning",
        path: "memory/inferred/candidate.md",
        message: "inferred memory 缺少 review_after、expires_at 或 stale_after 复核字段。",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-memory-lint-"));
}

function writeFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

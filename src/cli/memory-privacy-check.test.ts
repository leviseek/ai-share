import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkMemoryPrivacy } from "./memory-privacy-check.ts";

describe("memory privacy check", () => {
  test("passes declared privacy layers without concrete local paths or secrets", () => {
    const root = makeRoot();
    try {
      writeRequiredGitignore(root);
      writeFile(root, "memory/architecture/ai.md", "repo root: <repo>\n");
      writeFile(root, "memory/user/profile.md", "偏好：简体中文。\n");

      expect(checkMemoryPrivacy(root, { checkGitTracking: false })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects shareable local paths, secret literals, unknown layers, and missing ignore rules", () => {
    const root = makeRoot();
    try {
      writeFile(root, ".gitignore", "memory/local/\n");
      writeFile(root, "memory/architecture/ai.md", "repo: D:\\ai-share\\memory\n");
      writeFile(root, "memory/user/profile.md", "secret: sk-1234567890abcdefghijkl\n");
      writeFile(root, "memory/misc/note.md", "uncategorized\n");

      const findings = checkMemoryPrivacy(root, { checkGitTracking: false }).map((finding) => finding.message);

      expect(findings).toContain("缺少隐私层 ignore 规则：config/local/");
      expect(findings).toContain("shareable memory 不应包含具体本机绝对路径；请改为 <repo>、<home> 或说明性占位符。");
      expect(findings).toContain("memory 中疑似包含明文 secret；请改为环境变量名或删除。");
      expect(findings).toContain("memory 文件未归入已声明的隐私层。");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("supports line-scoped privacy allow directives with reasons", () => {
    const root = makeRoot();
    try {
      writeRequiredGitignore(root);
      writeFile(
        root,
        "memory/architecture/ai.md",
        [
          "example path: D:\\fixture\\repo # ai-share-privacy-allow: local-path -- fixture path in test docs",
          "contact: person@example.com",
          "owner: user@private.test",
        ].join("\n"),
      );

      const findings = checkMemoryPrivacy(root, { checkGitTracking: false });

      expect(findings).toEqual([
        {
          severity: "warning",
          path: "memory/architecture/ai.md",
          line: 3,
          message:
            "shareable memory 疑似包含个人标识；如确需保留，请添加 ai-share-privacy-allow: personal-data -- reason。",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-memory-"));
}

function writeRequiredGitignore(root: string): void {
  writeFile(
    root,
    ".gitignore",
    ["config/local/", "memory/local/", "memory/private/", "memory/project/", "memory/runtime/", "memory/sync/"].join(
      "\n",
    ),
  );
}

function writeFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

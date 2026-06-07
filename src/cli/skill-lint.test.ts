import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lintSkills } from "./skill-lint.ts";

describe("skill lint", () => {
  test("passes a clean skill", () => {
    const root = makeRoot();
    try {
      writeSkill(
        root,
        "clean-skill",
        `---
name: clean-skill
description: Use when validating a clean skill fixture with clear trigger semantics.
---

# Clean Skill

## Trigger Examples

- "Use this skill for a clean fixture."
- "Validate this skill file."
- "Check the skill contract."

## Anti Examples

- "Run unrelated tests."
- "Commit current changes."
- "Choose a model."
`,
      );

      expect(lintSkills(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports frontmatter and secret errors", () => {
    const root = makeRoot();
    try {
      writeSkill(
        root,
        "bad-skill",
        `---
name: wrong-name
description: Use when testing error fixtures.
extra: nope
---

# Bad Skill

${syntheticSecret()}
`,
      );

      const findings = lintSkills(root);

      expect(findings).toContainEqual({
        severity: "error",
        path: "skills/bad-skill/SKILL.md",
        line: 1,
        message: "skill lint 检测到 frontmatter name 与目录名不一致。",
      });
      expect(findings).toContainEqual({
        severity: "error",
        path: "skills/bad-skill/SKILL.md",
        line: 1,
        message: "skill lint 检测到不允许的 frontmatter 字段：extra。",
      });
      expect(findings.some((finding) => finding.severity === "error" && finding.message.includes("secret"))).toBe(true);
      expect(JSON.stringify(findings)).not.toContain(syntheticSecret());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports missing SKILL.md and warning-only quality issues", () => {
    const root = makeRoot();
    try {
      mkdirSync(join(root, "skills", "missing-skill"), { recursive: true });
      writeSkill(
        root,
        "thin-skill",
        `---
name: thin-skill
description: Thin.
---

# Thin Skill
`,
      );
      writeFile(root, "skills/thin-skill/README.md", "# Extra docs\n");

      const findings = lintSkills(root);

      expect(findings).toContainEqual({
        severity: "error",
        path: "skills/missing-skill/SKILL.md",
        message: "skill lint 检测到缺失的 SKILL.md。",
      });
      expect(findings).toContainEqual({
        severity: "warning",
        path: "skills/thin-skill/SKILL.md",
        message: "skill lint 检测到 description 过短或缺少明确触发语义。",
      });
      expect(findings).toContainEqual({
        severity: "warning",
        path: "skills/thin-skill/README.md",
        message: "skill lint 检测到 skill 目录包含非必要文档。",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-share-skill-lint-"));
}

function writeSkill(root: string, name: string, content: string): void {
  writeFile(root, join("skills", name, "SKILL.md"), content);
}

function writeFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function syntheticSecret(): string {
  return ["sk", "1234567890abcdefghijkl"].join("-");
}

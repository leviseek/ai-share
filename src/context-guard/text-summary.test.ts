import { describe, expect, it } from "bun:test";
import { buildRescueSummary, summarizeMessages, bulletList, sanitizeFileName } from "./text-summary.ts";

describe("buildRescueSummary", () => {
  const mockMessages = [
    {
      data: { role: "user", content: "请帮我重构这个项目的 auth 模块" },
      timeCreated: "2026-05-15T10:00:00Z",
    },
    {
      data: {
        role: "assistant",
        content: "## Done\n已完成 auth 模块重构，提取了 AuthService 类\n",
      },
      timeCreated: "2026-05-15T10:01:00Z",
    },
    {
      data: {
        role: "assistant",
        content: "已决定采用 strategy pattern 处理多种认证方式，使用依赖注入替代之前的静态方法。",
      },
      timeCreated: "2026-05-15T10:02:00Z",
    },
    {
      data: { role: "user", content: "再添加一个 refresh token 的 endpoint" },
      timeCreated: "2026-05-15T10:03:00Z",
    },
    {
      data: {
        role: "assistant",
        content: "## Next Steps\nrefresh token 方案选择：使用 JWT 还是 opaque token？",
      },
      timeCreated: "2026-05-15T10:04:00Z",
    },
    {
      data: {
        role: "assistant",
        content:
          "## 目标\n我们决定使用 JWT 方案，因为不需要服务端存储。架构上采用 refresh token rotation，access token 有效期 15 分钟。",
      },
      timeCreated: "2026-05-15T10:05:00Z",
    },
    {
      data: { role: "user", content: "我发现一个 error：数据库连接失败了" },
      timeCreated: "2026-05-15T10:06:00Z",
    },
    {
      data: { role: "assistant", content: "报错：连接池配置错误，failed to connect to database" },
      timeCreated: "2026-05-15T10:07:00Z",
    },
  ];

  const stats = summarizeMessages(mockMessages);

  it("should produce five-section structured format", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);

    // Verify all expected sections exist
    expect(summary).toContain("# OpenCode Session Rescue");
    expect(summary).toContain("## Session");
    expect(summary).toContain("## Goal — what was being worked on");
    expect(summary).toContain("## Progress — what was accomplished");
    expect(summary).toContain("## Key Decisions — architecture/approach decisions made");
    expect(summary).toContain("## Unresolved Issues — blockers, errors, pending items");
    expect(summary).toContain("## Relevant Files — files modified or discussed");
    expect(summary).toContain("## Context Diagnostics");
    expect(summary).toContain("## Next Step");
  });

  it("should include session ID", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);
    expect(summary).toContain("ses_test123");
  });

  it("should extract first 3 user messages into Goal section", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);
    expect(summary).toContain("请帮我重构这个项目的 auth 模块");
    expect(summary).toContain("再添加一个 refresh token 的 endpoint");
    expect(summary).toContain("数据库连接失败了");
  });

  it("should extract assistant summaries into Progress section", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);
    expect(summary).toContain("已完成 auth 模块重构");
    expect(summary).toContain("refresh token 方案选择");
    expect(summary).toContain("我们决定使用 JWT 方案");
  });

  it("should extract decision-related lines into Key Decisions section", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);
    // "已决定" matches the decision pattern
    expect(summary).toContain("已决定采用 strategy pattern");
    // "方案" also matches
    expect(summary).toContain("refresh token 方案选择");
    expect(summary).toContain("我们决定使用 JWT 方案");
  });

  it("should extract error/failure lines into Unresolved Issues section", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);
    expect(summary).toContain("数据库连接失败了");
    expect(summary).toContain("failed to connect to database");
    expect(summary).toContain("连接池配置错误");
  });

  it("should have None section", () => {
    const summary = buildRescueSummary("ses_test456", [], stats);
    expect(summary).toContain("- (none)");
  });

  it("should produce empty Relevant Files section for no-files input", () => {
    const summary = buildRescueSummary("ses_test123", mockMessages, stats);
    expect(summary).toContain("## Relevant Files");
  });
});

describe("summarizeMessages", () => {
  it("should return stats for empty messages", () => {
    const stats = summarizeMessages([]);
    expect(stats.messageCount).toBe(0);
    expect(stats.toolResultCount).toBe(0);
    expect(stats.largeMessageCount).toBe(0);
    expect(stats.totalChars).toBe(0);
  });

  it("should detect auto-slash-command blocks", () => {
    const messages = [{ data: { role: "user", content: "<auto-slash-command>test</auto-slash-command>" } }];
    const stats = summarizeMessages(messages);
    expect(stats.autoSlashBlocks).toBe(1);
  });

  it("should detect diff blocks", () => {
    const messages = [{ data: { role: "assistant", content: "diff --git a/file.ts b/file.ts" } }];
    const stats = summarizeMessages(messages);
    expect(stats.diffBlocks).toBeGreaterThanOrEqual(1);
  });
});

describe("bulletList", () => {
  it("should return (none) for empty array", () => {
    expect(bulletList([])).toBe("- (none)");
  });

  it("should format items as bullet list", () => {
    expect(bulletList(["a", "b"])).toBe("- a\n- b");
  });

  it("should handle multiline items", () => {
    const result = bulletList(["line1\nline2"]);
    expect(result).toBe("- line1\n  line2");
  });
});

describe("sanitizeFileName", () => {
  it("should replace special characters", () => {
    expect(sanitizeFileName("ses:abc/def")).toBe("ses_abc_def");
  });

  it("should keep alphanumeric and dot/hyphen", () => {
    expect(sanitizeFileName("test-file_v2.1")).toBe("test-file_v2.1");
  });
});

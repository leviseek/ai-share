import { describe, expect, test } from "bun:test";
import type { KnowledgeObject, SummaryProvenance } from "../core/types.ts";
import { inferNodeSummary, normalizeSummaryText, SUMMARY_MAX_LENGTH } from "./index.ts";

const now = "2026-07-02T00:00:00.000Z";

describe("RIE node summary inference", () => {
  test("normalizes explicit summaries", () => {
    const result = inferNodeSummary({
      object: object({
        summary: `This is a very long explicit summary with token = abc123 and ${"extra ".repeat(40)}`,
      }),
      relationships: [],
    });

    expect(result.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
    expect(result.summary).toContain("token = <redacted>");
    expect(result.summaryProvenance.source).toBe("explicit");
    expect(result.summaryProvenance.confidence).toBe("high");
  });

  test("keeps identifiers unchanged in inferred Chinese summaries", () => {
    const result = inferNodeSummary({
      object: object({ type: "CodeFile", title: "main.ts", path: "src/main.ts", language: "typescript" }),
      relationships: [],
    });

    expect(result.summary).toContain("main.ts");
    expect(result.summary).toContain("src/main.ts");
    expect(result.summary).toMatch(/[文件模块配置目录脚本项目代码]/);
    expect(result.summaryProvenance.source).toBe("inferred");
  });

  test("is deterministic for the same object and relationships", () => {
    const input = {
      object: object({ type: "Config", title: "provider.yaml", path: "config/provider.yaml", language: "yaml" }),
      relationships: [],
    };

    expect(inferNodeSummary(input)).toEqual(inferNodeSummary(input));
  });

  test("uses no-summary fallback when no safe signal exists", () => {
    const result = inferNodeSummary({ object: object({ title: "", type: "File" }), relationships: [] });

    expect(result.summaryProvenance.source).toBe("no-summary");
    expect(result.summaryProvenance.fallbackReason).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  test("normalizes standalone text with redaction and compaction", () => {
    const result = normalizeSummaryText(`password: hunter2 ${"x".repeat(200)}`);
    expect(result).toContain("password: <redacted>");
    expect(result.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
  });

  test("keeps ai-enhanced provenance reserved as a valid future source", () => {
    const provenance: SummaryProvenance = {
      source: "ai-enhanced",
      signals: ["metadata"],
      confidence: "medium",
    };

    expect(provenance.source).toBe("ai-enhanced");
  });
});

function object(input: Partial<KnowledgeObject>): KnowledgeObject {
  return {
    id: input.id ?? "file:",
    type: input.type ?? "File",
    title: input.title ?? "demo.txt",
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    relationships: [],
    updated_at: now,
    hash: input.hash ?? "hash",
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.path === undefined ? {} : { path: input.path }),
    ...(input.language === undefined ? {} : { language: input.language }),
  };
}

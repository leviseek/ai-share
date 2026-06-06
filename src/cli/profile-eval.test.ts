import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelsYaml, ProfilesYaml } from "../types.ts";
import {
  buildEvaluationReport,
  buildTaskCatalog,
  formatMarkdownReport,
  parseProfileEvalArgs,
  writeReport,
} from "./profile-eval.ts";

describe("profile evaluation harness", () => {
  test("parses planned evaluation options without execute", () => {
    expect(
      parseProfileEvalArgs(
        [
          "--task",
          "分析当前项目",
          "--profiles",
          "coding,max",
          "--manual-success",
          "unknown",
          "--manual-rework-minutes",
          "0",
          "--repeat",
          "2",
          "--notes",
          "baseline",
        ],
        ["coding", "max", "research"],
        ["project_analysis"],
      ),
    ).toEqual({
      task: "分析当前项目",
      taskIds: [],
      profiles: ["coding", "max"],
      execute: false,
      repeat: 2,
      manualSuccess: "unknown",
      manualReworkMinutes: 0,
      notes: "baseline",
    });
  });

  test("builds a comparable planned report with cost estimates for a custom task", () => {
    const report = buildEvaluationReport(
      profilesFixture(),
      modelsFixture(),
      {
        task: "修复测试并总结风险",
        taskIds: [],
        profiles: ["coding"],
        execute: false,
        repeat: 1,
        manualSuccess: "unknown",
      },
      new Date("2026-06-06T00:00:00.000Z"),
    );

    expect(report).toEqual({
      protocol: "ai-share/profile-eval/v2",
      task_set: "custom",
      execute: false,
      created_at: "2026-06-06T00:00:00.000Z",
      cost_basis: "config.models.cost per 1K tokens",
      scoring: {},
      tasks: [
        {
          id: "custom",
          title: "custom",
          category: "custom",
          weight: 1,
          prompt: "修复测试并总结风险",
          success_criteria: [],
        },
      ],
      runs: [
        {
          profile: "coding",
          task_id: "custom",
          repeat: 1,
          task_weight: 1,
          models: {
            primary: "gpt-5.5-coding",
            reasoning: "deepseek-v4-pro-think",
            fast: "gpt-5.4-mini",
          },
          estimate: {
            input_tokens: 3,
            primary_input_cost_usd: 0.00003,
            primary_max_output_cost_usd: 0.24576,
          },
          result: {
            status: "planned",
            exit_code: null,
            elapsed_ms: null,
            actual_elapsed_ms: null,
            stdout_path: null,
            stderr_path: null,
            failure_tag: null,
            manual_success: "unknown",
            manual_rework_minutes: null,
            manual_score: null,
            score: null,
            score_basis: "unscored",
            notes: "",
          },
        },
      ],
      summary: [
        {
          profile: "coding",
          runs: 1,
          scored_runs: 0,
          weighted_score: null,
          average_actual_elapsed_ms: null,
          estimated_primary_cost_usd: 0.24579,
        },
      ],
    });
  });

  test("uses fixed task sets and manual score fields", () => {
    const taskCatalog = buildTaskCatalog({
      task_set: "default",
      tasks: {
        project_analysis: {
          title: "当前项目分析",
          category: "analysis",
          weight: 1.5,
          prompt: "分析当前项目",
          success_criteria: ["列出风险"],
        },
      },
    });

    const options = parseProfileEvalArgs(
      [
        "--tasks",
        "project_analysis",
        "--profiles",
        "coding",
        "--manual-score",
        "88",
        "--failure-tag",
        "needs-review",
        "--notes",
        "ok",
      ],
      ["coding"],
      Object.keys(taskCatalog),
    );
    const report = buildEvaluationReport(
      profilesFixture(),
      modelsFixture(),
      options,
      new Date("2026-06-06T00:00:00.000Z"),
      taskCatalog,
      { pass_score: 80 },
      "default",
    );

    expect(report.task_set).toBe("default");
    expect(report.tasks[0]?.success_criteria).toEqual(["列出风险"]);
    expect(report.runs[0]?.result).toMatchObject({
      manual_score: 88,
      failure_tag: "needs-review",
      score: 88,
      score_basis: "manual_score",
      notes: "ok",
    });
    expect(report.summary).toEqual([
      {
        profile: "coding",
        runs: 1,
        scored_runs: 1,
        weighted_score: 88,
        average_actual_elapsed_ms: null,
        estimated_primary_cost_usd: 0.24578,
      },
    ]);
  });

  test("escapes markdown table cells in reports", () => {
    const report = buildEvaluationReport(
      profilesFixture(),
      modelsFixture(),
      {
        task: "custom",
        taskIds: [],
        profiles: ["coding"],
        execute: false,
        repeat: 1,
        failureTag: "bad|pipe",
      },
      new Date("2026-06-06T00:00:00.000Z"),
    );
    const run = report.runs[0];
    if (!run) throw new Error("missing test run");
    run.result.stdout_path = "C:\\tmp\\out|1.txt";

    expect(formatMarkdownReport(report)).toContain("bad\\|pipe");
    expect(formatMarkdownReport(report)).toContain("C:\\\\tmp\\\\out\\|1.txt");
    expect(formatMarkdownReport(report)).toContain("average_actual_elapsed_ms");
  });

  test("returns JSON and Markdown output paths when writing reports", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ai-share-profile-eval-"));
    try {
      const report = buildEvaluationReport(
        profilesFixture(),
        modelsFixture(),
        {
          task: "custom",
          taskIds: [],
          profiles: ["coding"],
          execute: false,
          repeat: 1,
        },
        new Date("2026-06-06T00:00:00.000Z"),
      );
      const written = writeReport(join(tempDir, "report.json"), report);

      expect(written.jsonPath.endsWith("report.json")).toBe(true);
      expect(written.markdownPath.endsWith("report.md")).toBe(true);
      expect(report.markdown_output_path).toBe(written.markdownPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function profilesFixture(): ProfilesYaml {
  return {
    coding: {
      models: {
        primary: "gpt-5.5-coding",
        reasoning: "deepseek-v4-pro-think",
        fast: "gpt-5.4-mini",
      },
    },
  };
}

function modelsFixture(): ModelsYaml {
  return {
    "gpt-5.5-coding": {
      provider_group: "gpt",
      model_name: "gpt-5.5",
      cost: {
        input: 0.01,
        output: 0.03,
      },
      limits: {
        context_window: 200000,
        max_output: 8192,
      },
    },
  };
}

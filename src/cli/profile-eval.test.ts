import { describe, expect, test } from "bun:test";
import type { ModelsYaml, ProfilesYaml } from "../types.ts";
import { buildEvaluationReport, buildTaskCatalog, parseProfileEvalArgs } from "./profile-eval.ts";

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
      ["--tasks", "project_analysis", "--profiles", "coding", "--manual-score", "88", "--notes", "ok"],
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
        estimated_primary_cost_usd: 0.24578,
      },
    ]);
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

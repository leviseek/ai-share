import { describe, expect, test } from "bun:test";
import type { ModelsYaml, ProfilesYaml } from "../types.ts";
import { buildEvaluationReport, parseProfileEvalArgs } from "./profile-eval.ts";

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
      ),
    ).toEqual({
      task: "分析当前项目",
      profiles: ["coding", "max"],
      execute: false,
      manualSuccess: "unknown",
      manualReworkMinutes: 0,
      notes: "baseline",
    });
  });

  test("builds a comparable planned report with cost estimates", () => {
    const report = buildEvaluationReport(
      profilesFixture(),
      modelsFixture(),
      {
        task: "修复测试并总结风险",
        profiles: ["coding"],
        execute: false,
        manualSuccess: "unknown",
      },
      new Date("2026-06-06T00:00:00.000Z"),
    );

    expect(report).toEqual({
      protocol: "ai-share/profile-eval/v1",
      task: "修复测试并总结风险",
      execute: false,
      created_at: "2026-06-06T00:00:00.000Z",
      cost_basis: "config.models.cost per 1K tokens",
      runs: [
        {
          profile: "coding",
          models: {
            primary: "gpt-5.3-codex",
            reasoning: "deepseek-v4-pro-think",
            fast: "gpt-5.4-mini",
          },
          estimate: {
            input_tokens: 3,
            primary_input_cost_usd: 0.000021,
            primary_max_output_cost_usd: 0.172032,
          },
          result: {
            status: "planned",
            exit_code: null,
            elapsed_ms: null,
            manual_success: "unknown",
            manual_rework_minutes: null,
            notes: "",
          },
        },
      ],
    });
  });
});

function profilesFixture(): ProfilesYaml {
  return {
    coding: {
      models: {
        primary: "gpt-5.3-codex",
        reasoning: "deepseek-v4-pro-think",
        fast: "gpt-5.4-mini",
      },
    },
  };
}

function modelsFixture(): ModelsYaml {
  return {
    "gpt-5.3-codex": {
      provider_group: "gpt",
      model_name: "gpt-5.3-codex",
      cost: {
        input: 0.007,
        output: 0.021,
      },
      limits: {
        context_window: 128000,
        max_output: 8192,
      },
    },
  };
}

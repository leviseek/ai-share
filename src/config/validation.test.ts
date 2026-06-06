import { describe, expect, test } from "bun:test";
import type { AgentsYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../types.ts";
import { validateYamlConsistency } from "./validation.ts";

describe("validateYamlConsistency", () => {
  test("reports undefined model references across profiles, compaction, fallback, and agents", () => {
    const models: ModelsYaml = {
      "known-model": {
        ...model("known-model"),
        fallback: ["missing-fallback"],
      },
    };
    const profiles: ProfilesYaml = {
      coding: {
        models: {
          primary: "missing-primary",
          reasoning: "known-model",
          fast: "known-model",
        },
        compaction: {
          threshold: 100,
          max_input_tokens: 200,
          model: "missing-compaction",
        },
      },
    };
    const agents: AgentsYaml = {
      agents: {
        bad: {
          model: "missing-agent",
        },
      },
    };

    const errors = validateYamlConsistency(profiles, models, providers(), global(), mcp(), agents).map(formatError);

    expect(errors).toContain(
      "profiles.yaml:profiles.coding.models.primary:profile 'coding' 的 models.primary 引用未定义模型 'missing-primary'",
    );
    expect(errors).toContain(
      "profiles.yaml:profiles.coding.compaction.model:profile 'coding' 的 compaction.model 引用未定义模型或角色 'missing-compaction'",
    );
    expect(errors).toContain(
      "models.yaml:models.known-model.fallback:模型 'known-model' 的 fallback 引用未定义模型 'missing-fallback'",
    );
    expect(errors).toContain(
      "agents.yaml:agents.bad.model:agent 'bad' 的 model 必须引用 primary、reasoning 或 fast 角色",
    );
  });

  test("allows profile model ids plus agent and compaction role aliases", () => {
    const models: ModelsYaml = {
      "primary-model": { ...model("primary-model"), fallback: ["fast-model"] },
      "reasoning-model": model("reasoning-model"),
      "fast-model": model("fast-model"),
    };
    const profiles: ProfilesYaml = {
      coding: {
        models: {
          primary: "primary-model",
          reasoning: "reasoning-model",
          fast: "fast-model",
        },
        compaction: {
          threshold: 100,
          max_input_tokens: 200,
          model: "fast",
        },
      },
    };
    const agents: AgentsYaml = {
      agents: {
        coder: {
          model: "primary",
        },
        reviewer: {
          model: "reasoning",
        },
      },
    };

    expect(validateYamlConsistency(profiles, models, providers(), global(), mcp(), agents)).toEqual([]);
  });

  test("reports invalid model catalog schema fields", () => {
    const models = {
      "valid-model": model("valid-model"),
      "invalid-model": {
        provider_group: "",
        cost: {
          input: 0,
        },
        limits: {
          context_window: "wide",
          max_output: 0,
        },
        capabilities: ["tools", 1],
        temperature: "warm",
        fallback: ["valid-model", 1],
      },
      "unknown-group": {
        ...model("unknown-group"),
        provider_group: "unknown",
      },
      "not-object": null,
    } as unknown as ModelsYaml;
    const profiles: ProfilesYaml = {
      coding: {
        models: {
          primary: "valid-model",
          reasoning: "valid-model",
          fast: "valid-model",
        },
      },
    };

    const errors = validateYamlConsistency(profiles, models, providers(), global(), mcp()).map(formatError);

    const expectedErrors = [
      "models.yaml:models.invalid-model.provider_group:模型 'invalid-model' 的 provider_group 必须是非空字符串",
      "models.yaml:models.invalid-model.model_name:模型 'invalid-model' 缺少 model_name 字段",
      "models.yaml:models.invalid-model.cost.input:模型 'invalid-model' 的 cost.input 必须是正数",
      "models.yaml:models.invalid-model.cost.output:模型 'invalid-model' 缺少 cost.output 字段",
      "models.yaml:models.invalid-model.limits.context_window:模型 'invalid-model' 的 limits.context_window 必须是正数",
      "models.yaml:models.invalid-model.limits.max_output:模型 'invalid-model' 的 limits.max_output 必须是正数",
      "models.yaml:models.invalid-model.capabilities:模型 'invalid-model' 的 capabilities 必须是字符串数组",
      "models.yaml:models.invalid-model.temperature:模型 'invalid-model' 的 temperature 必须是数字",
      "models.yaml:models.invalid-model.fallback:模型 'invalid-model' 的 fallback 必须是字符串数组",
      "models.yaml:models.unknown-group.provider_group:模型 'unknown-group' 使用了未知 provider_group 'unknown'",
      "models.yaml:models.not-object:模型 'not-object' 必须是对象",
    ];
    for (const expectedError of expectedErrors) {
      expect(errors).toContain(expectedError);
    }
  });
});

function model(modelName: string): ModelsYaml[string] {
  return {
    provider_group: "gpt",
    model_name: modelName,
    cost: {
      input: 1,
      output: 2,
    },
    limits: {
      context_window: 1000,
      max_output: 100,
    },
  };
}

function providers(): ProviderYaml {
  return {
    providers: {
      codexapis: {
        base_url: "https://example.test/v1",
        api_key: "${CODEXAPIS_API_KEY}",
      },
    },
  };
}

function global(): GlobalYaml {
  return {
    default_profile: "coding",
  };
}

function mcp(): McpYaml {
  return {};
}

function formatError(error: { file: string; path: string; message: string }): string {
  return `${error.file}:${error.path}:${error.message}`;
}

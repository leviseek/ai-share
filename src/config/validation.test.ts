import { describe, expect, test } from "bun:test";
import type { AgentsYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../types.ts";
import { validateYamlConsistency } from "./validation.ts";

describe("validateYamlConsistency", () => {
  test("reports undefined model references across profiles, compaction, fallback, and agents", () => {
    const models: ModelsYaml = {
      "known-model": {
        provider_group: "gpt",
        model_name: "known-model",
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
      "primary-model": {
        provider_group: "gpt",
        model_name: "primary-model",
        fallback: ["fast-model"],
      },
      "reasoning-model": {
        provider_group: "gpt",
        model_name: "reasoning-model",
      },
      "fast-model": {
        provider_group: "gpt",
        model_name: "fast-model",
      },
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
});

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

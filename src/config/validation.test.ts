import { describe, expect, test } from "bun:test";
import type { AgentsYaml, EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProfilesYaml, ProviderYaml } from "../types.ts";
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
    const agents = validAgents({
      bad: {
        model: "missing-agent",
      },
    });

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
    expect(errors).toContain("agents.yaml:agents.bad.model:agents.bad.model 必须是 primary、reasoning 或 fast");
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
    const agents = validAgents({
      coder: {
        model: "primary",
      },
      reviewer: {
        model: "reasoning",
      },
    });

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

    const errors = validateYamlConsistency(profiles, models, providers(), global(), mcp(), validAgents()).map(
      formatError,
    );

    const expectedErrors = [
      "models.yaml:models.invalid-model.provider_group:models.invalid-model.provider_group 必须是非空字符串",
      "models.yaml:models.invalid-model.model_name:缺少 models.invalid-model.model_name 字段",
      "models.yaml:models.invalid-model.cost.input:models.invalid-model.cost.input 必须大于 0",
      "models.yaml:models.invalid-model.cost.output:缺少 models.invalid-model.cost.output 字段",
      "models.yaml:models.invalid-model.limits.context_window:models.invalid-model.limits.context_window 必须是数字",
      "models.yaml:models.invalid-model.limits.max_output:models.invalid-model.limits.max_output 必须大于 0",
      "models.yaml:models.invalid-model.capabilities[1]:models.invalid-model.capabilities[1] 必须是非空字符串",
      "models.yaml:models.invalid-model.temperature:models.invalid-model.temperature 必须是数字",
      "models.yaml:models.invalid-model.fallback[1]:models.invalid-model.fallback[1] 必须是非空字符串",
      "models.yaml:models.unknown-group.provider_group:模型 'unknown-group' 使用了未知 provider_group 'unknown'",
      "models.yaml:models.not-object:models.not-object 必须是对象",
    ];
    for (const expectedError of expectedErrors) {
      expect(errors).toContain(expectedError);
    }
  });

  test("reports invalid provider, profile, agent, and MCP schema fields", () => {
    const models: ModelsYaml = {
      "valid-model": model("valid-model"),
    };
    const profiles = {
      valid: {
        models: {
          primary: "valid-model",
          reasoning: "valid-model",
          fast: "valid-model",
        },
      },
      "not-object": null,
      malformed: {
        name: 1,
        models: [],
        compaction: {
          enabled: "yes",
          threshold: "soon",
          max_input_tokens: 10,
          model: 1,
        },
      },
    } as unknown as ProfilesYaml;
    const providersConfig = {
      providers: {
        codexapis: {
          name: 1,
          base_url: 1,
          api_key: "sk-not-an-env-reference",
          timeout: "slow",
        },
        deepseek: null,
      },
    } as unknown as ProviderYaml;
    const agentsConfig = {
      shared_prompt: 1,
      codex: {
        agents: {
          max_threads: 0,
          max_depth: "deep",
        },
      },
      omx: {
        model_slots: {
          default: "primary",
          team: "missing-role",
          autopilot: "reasoning",
          ralph: "primary",
        },
        agent_reasoning: {
          "missing-agent": "high",
          malformed: "max",
        },
      },
      agents: {
        "not-object": null,
        malformed: {
          model: 1,
          prompt: {
            append: 1,
          },
          permission: {
            edit: 1,
          },
        },
      },
    } as unknown as AgentsYaml;
    const mcpConfig = {
      servers: {
        "not-object": null,
        malformed: {
          command: 1,
          args: ["ok", 1],
          env: {
            TOKEN: "plain-token",
            BAD_VALUE: 1,
            "bad-name": "${OK}",
          },
        },
      },
    } as unknown as McpYaml;

    const errors = validateYamlConsistency(
      profiles,
      models,
      providersConfig,
      { default_profile: "valid" },
      mcpConfig,
      agentsConfig,
    ).map(formatError);

    for (const expectedError of [
      "provider.yaml:providers.codexapis.base_url:providers.codexapis.base_url 必须是非空字符串",
      "provider.yaml:providers.codexapis.api_key:providers.codexapis.api_key 格式不符合要求",
      "provider.yaml:providers.deepseek:providers.deepseek 必须是对象",
      "profiles.yaml:profiles.not-object:profiles.not-object 必须是对象",
      "profiles.yaml:profiles.malformed.name:profiles.malformed.name 必须是非空字符串",
      "profiles.yaml:profiles.malformed.models:profiles.malformed.models 必须是对象",
      "profiles.yaml:profiles.malformed.compaction.enabled:profiles.malformed.compaction.enabled 必须是布尔值",
      "profiles.yaml:profiles.malformed.compaction.threshold:profiles.malformed.compaction.threshold 必须是数字",
      "profiles.yaml:profiles.malformed.compaction.model:profiles.malformed.compaction.model 必须是非空字符串",
      "agents.yaml:shared_prompt:shared_prompt 必须是对象",
      "agents.yaml:codex.agents.max_threads:codex.agents.max_threads 必须大于等于 1",
      "agents.yaml:codex.agents.max_depth:codex.agents.max_depth 必须是整数",
      "agents.yaml:codex.agents.job_max_runtime_seconds:缺少 codex.agents.job_max_runtime_seconds 字段",
      "agents.yaml:omx.model_slots.team:omx.model_slots.team 必须是 primary、reasoning 或 fast",
      "agents.yaml:omx.model_slots.team_low_complexity:缺少 omx.model_slots.team_low_complexity 字段",
      "agents.yaml:omx.agent_reasoning.missing-agent:omx.agent_reasoning 引用未定义 agent 'missing-agent'",
      "agents.yaml:omx.agent_reasoning.malformed:omx.agent_reasoning.malformed 必须是 low、medium 或 high",
      "agents.yaml:agents.not-object:agents.not-object 必须是对象",
      "agents.yaml:agents.malformed.model:agents.malformed.model 必须是非空字符串",
      "agents.yaml:agents.malformed.prompt.append:agents.malformed.prompt.append 必须是非空字符串",
      "agents.yaml:agents.malformed.permission.edit:agents.malformed.permission.edit 必须是非空字符串",
      "mcp.yaml:servers.not-object:servers.not-object 必须是对象",
      "mcp.yaml:servers.malformed.command:servers.malformed.command 必须是非空字符串",
      "mcp.yaml:servers.malformed.args[1]:servers.malformed.args[1] 必须是非空字符串",
      "mcp.yaml:servers.malformed.env.TOKEN:stdio MCP server 'malformed' 的敏感 env 'TOKEN' 必须使用 ${ENV_NAME} 占位，不允许写入明文",
      "mcp.yaml:servers.malformed.env.BAD_VALUE:servers.malformed.env.BAD_VALUE 必须是非空字符串",
      "mcp.yaml:servers.malformed.env.bad-name:servers.malformed.env key 'bad-name' 格式不符合要求",
    ]) {
      expect(errors).toContain(expectedError);
    }
  });

  test("rejects sensitive or generator-managed Codex .env variables", () => {
    const models: ModelsYaml = {
      "valid-model": model("valid-model"),
    };
    const profiles: ProfilesYaml = {
      valid: {
        models: {
          primary: "valid-model",
          reasoning: "valid-model",
          fast: "valid-model",
        },
      },
    };
    const envConfig = {
      variables: {
        HTTP_PROXY: "http://127.0.0.1:7890",
        CODEX_HOME: "/tmp/codex",
        AI_SHARE_TASK: "local-task",
        OMX_DEFAULT_FRONTIER_MODEL: "gpt",
        CODEXAPIS_API_KEY: "sk-not-allowed-here",
        LITERAL_VALUE: "sk-1234567890abcdef",
      },
    } as EnvYaml;

    const errors = validateYamlConsistency(
      profiles,
      models,
      providers(),
      { default_profile: "valid" },
      mcp(),
      validAgents(),
      envConfig,
    ).map(formatError);

    for (const expectedError of [
      "env.yaml:variables.CODEX_HOME:env 'CODEX_HOME' 不应写入 Codex .env；请保留给系统环境、生成器参数或 aiomx profile 管理",
      "env.yaml:variables.AI_SHARE_TASK:env 'AI_SHARE_TASK' 不应写入 Codex .env；请保留给系统环境、生成器参数或 aiomx profile 管理",
      "env.yaml:variables.OMX_DEFAULT_FRONTIER_MODEL:env 'OMX_DEFAULT_FRONTIER_MODEL' 不应写入 Codex .env；请保留给系统环境、生成器参数或 aiomx profile 管理",
      "env.yaml:variables.CODEXAPIS_API_KEY:env 'CODEXAPIS_API_KEY' 看起来是敏感变量，不允许通过 config/env.yaml 写入 Codex .env",
      "env.yaml:variables.LITERAL_VALUE:env 'LITERAL_VALUE' 疑似包含明文 secret，不允许写入 config/env.yaml",
    ]) {
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

function validAgents(
  agentDefinitions: NonNullable<AgentsYaml["agents"]> = { coder: { model: "primary" } },
): AgentsYaml {
  return {
    codex: {
      agents: {
        max_threads: 6,
        max_depth: 2,
        job_max_runtime_seconds: 600,
      },
    },
    omx: {
      model_slots: {
        default: "primary",
        team: "reasoning",
        autopilot: "reasoning",
        ralph: "primary",
        team_low_complexity: "fast",
      },
      agent_reasoning: {},
    },
    agents: agentDefinitions,
  };
}

function formatError(error: { file: string; path: string; message: string }): string {
  return `${error.file}:${error.path}:${error.message}`;
}

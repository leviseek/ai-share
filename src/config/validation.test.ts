import { describe, expect, test } from "bun:test";
import type { EnvYaml, GlobalYaml, McpYaml, ModelsYaml, ProviderYaml } from "../types.ts";
import { validateYamlConsistency } from "./validation.ts";

describe("validateYamlConsistency", () => {
  test("reports undefined global model and fallback references", () => {
    const models: ModelsYaml = {
      "known-model": {
        ...model("known-model"),
        fallback: ["missing-fallback"],
      },
    };
    const errors = validateYamlConsistency(models, providers(), { model: "missing-model" }, mcp()).map(formatError);

    expect(errors).toContain("global.yaml:model:global.model 引用未定义模型 'missing-model'");
    expect(errors).toContain(
      "models.yaml:models.known-model.fallback:模型 'known-model' 的 fallback 引用未定义模型 'missing-fallback'",
    );
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

    const errors = validateYamlConsistency(models, providers(), { model: "valid-model" }, mcp(), {}).map(formatError);

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

  test("reports invalid provider, global, and MCP schema fields", () => {
    const models: ModelsYaml = {
      "valid-model": model("valid-model"),
    };
    const providersConfig = {
      providers: {
        codexapis: {
          name: 1,
          base_url: 1,
          api_key: "sk-not-an-env-reference",
          timeout: "slow",
        },
        packyapi: null,
      },
    } as unknown as ProviderYaml;
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
      models,
      providersConfig,
      { model: 1 } as unknown as GlobalYaml,
      mcpConfig,
    ).map(formatError);

    for (const expectedError of [
      "global.yaml:model:model 必须是非空字符串",
      "provider.yaml:providers.codexapis.base_url:providers.codexapis.base_url 必须是非空字符串",
      "provider.yaml:providers.codexapis.api_key:providers.codexapis.api_key 格式不符合要求",
      "provider.yaml:providers.packyapi:providers.packyapi 必须是对象",
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
    const envConfig = {
      variables: {
        HTTP_PROXY: "http://127.0.0.1:7897",
        CODEX_HOME: "/tmp/codex",
        AI_SHARE_TASK: "local-task",
        CODEXAPIS_API_KEY: "sk-not-allowed-here",
        LITERAL_VALUE: "sk-1234567890abcdef",
      },
    } as EnvYaml;

    const errors = validateYamlConsistency(models, providers(), { model: "valid-model" }, mcp(), envConfig).map(
      formatError,
    );

    for (const expectedError of [
      "env.yaml:variables.CODEX_HOME:env 'CODEX_HOME' 不应写入 Codex .env；请保留给系统环境或生成器参数管理",
      "env.yaml:variables.AI_SHARE_TASK:env 'AI_SHARE_TASK' 不应写入 Codex .env；请保留给系统环境或生成器参数管理",
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

function mcp(): McpYaml {
  return {};
}

function formatError(error: { file: string; path: string; message: string }): string {
  return `${error.file}:${error.path}:${error.message}`;
}

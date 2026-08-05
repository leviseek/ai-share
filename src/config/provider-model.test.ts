import { describe, expect, test } from "bun:test";
import type { ConfigSet } from "./validation.ts";
import { resolveProviderModelDecision } from "./provider-model.ts";

describe("provider-aware model resolution", () => {
  test("uses the global model for the global provider", () => {
    const decision = resolveProviderModelDecision(createConfig(), "codexapis");

    expect(decision).toEqual({
      providerId: "codexapis",
      modelId: "gpt-a",
      modelSource: "global-config",
    });
  });

  test("uses the selected provider default for a non-global provider", () => {
    const decision = resolveProviderModelDecision(createConfig(), "deepseek");

    expect(decision).toEqual({
      providerId: "deepseek",
      modelId: "deepseek-chat",
      modelSource: "provider-default",
    });
  });

  test("rejects an unknown provider", () => {
    expect(() => resolveProviderModelDecision(createConfig(), "missing-provider")).toThrow(
      "提供商未定义：missing-provider",
    );
  });

  test("rejects an unknown resolved model", () => {
    const config = createConfig();
    const provider = requireProvider(config, "deepseek");
    provider.default_model = "missing-model";

    expect(() => resolveProviderModelDecision(config, "deepseek")).toThrow("模型未定义：missing-model");
  });

  test("rejects a resolved model not associated with the selected provider", () => {
    const config = createConfig();
    config.global.model = "deepseek-chat";

    expect(() => resolveProviderModelDecision(config, "codexapis")).toThrow(
      "模型未关联提供商：codexapis/deepseek-chat",
    );
  });

  test("rejects inherited provider and model ids", () => {
    const config = createConfig();
    const provider = requireProvider(config, "deepseek");
    provider.models = ["constructor"];
    provider.default_model = "constructor";

    expect(() => resolveProviderModelDecision(config, "deepseek")).toThrow("模型未定义：constructor");
    expect(() => resolveProviderModelDecision(config, "constructor")).toThrow("提供商未定义：constructor");
  });
});

function createConfig(): ConfigSet {
  return {
    global: {
      model: "gpt-a",
      provider: "codexapis",
    },
    providers: {
      providers: {
        codexapis: {
          base_url: "https://codex.example.com/v1",
          api_key: "${CODEXAPIS_API_KEY}",
          models: ["gpt-a"],
          default_model: "gpt-a",
        },
        deepseek: {
          base_url: "https://deepseek.example.com/v1",
          api_key: "${DEEPSEEK_API_KEY}",
          models: ["deepseek-chat"],
          default_model: "deepseek-chat",
        },
      },
    },
    models: {
      "gpt-a": { model_name: "gpt-a" },
      "deepseek-chat": { model_name: "deepseek-chat" },
    },
    mcp: { servers: {} },
    env: { variables: {} },
    agents: { agents: {} },
    plugins: { plugins: [] },
    tools: { tools: [] },
  };
}

function requireProvider(config: ConfigSet, providerId: string): ConfigSet["providers"]["providers"][string] {
  const provider = config.providers.providers[providerId];
  if (!provider) throw new Error(`Test provider missing: ${providerId}`);
  return provider;
}

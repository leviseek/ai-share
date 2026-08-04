import { describe, expect, test } from "bun:test";
import type { ConfigSet } from "../validation.ts";
import { buildOpenCodeConfig } from "./opencode.ts";

describe("OpenCode provider generation", () => {
  test("generates only selected provider models for a compatible provider", () => {
    const config = createConfig();

    const output = buildOpenCodeConfig(config, "compatible", "shared", ["AGENTS.md"], "skills");

    expect(output.model).toBe("compatible/shared");
    expect(output.provider.compatible).toEqual({
      name: "Compatible",
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: "https://compatible.example.com/v1",
        apiKey: "{env:COMPATIBLE_API_KEY}",
      },
      models: {
        shared: {
          id: "shared-model",
          name: "shared",
          reasoning: true,
          options: { reasoningEffort: "high" },
        },
        "compatible-only": {
          id: "compatible-only-model",
          name: "compatible-only",
        },
      },
    });
  });

  test("generates native providers with a whitelist and transport options", () => {
    const config = createConfig();
    config.providers.providers.native = {
      name: "Native",
      base_url: "https://native.example.com/v1",
      api_key: "${NATIVE_API_KEY}",
      models: ["native-model"],
      default_model: "native-model",
      native: true,
    };

    const output = buildOpenCodeConfig(config, "native", "native-model", [], "skills");

    expect(output.provider.native).toEqual({
      whitelist: ["native-model"],
      options: {
        baseURL: "https://native.example.com/v1",
        apiKey: "{env:NATIVE_API_KEY}",
      },
    });
    expect(output.provider.native).not.toHaveProperty("name");
    expect(output.provider.native).not.toHaveProperty("npm");
    expect(output.provider.native).not.toHaveProperty("models");
  });

  test("requires the selected model to belong to the selected provider", () => {
    expect(() => buildOpenCodeConfig(createConfig(), "compatible", "native-model", [], "skills")).toThrow(
      "模型未关联提供商：compatible/native-model",
    );
  });

  test("requires bare agent models to belong to the selected provider", () => {
    const config = createConfig();
    config.agents.agents.worker = {
      description: "Worker",
      mode: "subagent",
      prompt: "Work",
      model: "native-model",
    };

    expect(() => buildOpenCodeConfig(config, "compatible", "shared", [], "skills")).toThrow(
      "agent 'worker' 引用未关联提供商模型 'compatible/native-model'",
    );
  });

  test("preserves full agent provider/model references", () => {
    const config = createConfig();
    config.agents.agents.worker = {
      description: "Worker",
      mode: "subagent",
      prompt: "Work",
      model: "other/model",
    };

    const output = buildOpenCodeConfig(config, "compatible", "shared", [], "skills");

    expect(output.agent.worker?.model).toBe("other/model");
  });

  test("does not resolve inherited model or provider properties", () => {
    const config = createConfig();

    expect(() => buildOpenCodeConfig(config, "constructor", "constructor", [], "skills")).toThrow(
      "提供商未定义：constructor",
    );
  });

  test("includes always_include providers alongside the selected provider", () => {
    const config = createConfig();
    const otherProvider = config.providers.providers.other;
    if (!otherProvider) throw new Error("test setup failed");
    otherProvider.always_include = true;

    const output = buildOpenCodeConfig(config, "compatible", "shared", [], "skills");

    const providers = output.provider;
    if (!providers) throw new Error("expected providers to be defined");
    expect(providers.compatible).toBeDefined();
    expect(providers.other).toBeDefined();
    expect(Object.keys(providers)).toHaveLength(2);
  });

  test("does not duplicate always_include provider when it is also selected", () => {
    const config = createConfig();
    const compatibleProvider = config.providers.providers.compatible;
    if (!compatibleProvider) throw new Error("test setup failed");
    compatibleProvider.always_include = true;

    const output = buildOpenCodeConfig(config, "compatible", "shared", [], "skills");

    const providers2 = output.provider;
    if (!providers2) throw new Error("expected providers to be defined");
    expect(providers2.compatible).toBeDefined();
    expect(Object.keys(providers2)).toHaveLength(1);
  });

  test("always_include providers are not checked against selected provider models", () => {
    const config = createConfig();
    const otherProvider = config.providers.providers.other;
    if (!otherProvider) throw new Error("test setup failed");
    otherProvider.always_include = true;

    expect(() => buildOpenCodeConfig(config, "compatible", "shared", [], "skills")).not.toThrow();
  });
});

function createConfig(): ConfigSet {
  return {
    global: { model: "shared", provider: "compatible" },
    providers: {
      providers: {
        compatible: {
          name: "Compatible",
          base_url: "https://compatible.example.com/v1",
          api_key: "${COMPATIBLE_API_KEY}",
          models: ["shared", "compatible-only"],
          default_model: "shared",
        },
        other: {
          base_url: "https://other.example.com/v1",
          api_key: "${OTHER_API_KEY}",
          models: ["native-model"],
          default_model: "native-model",
        },
      },
    },
    models: {
      shared: { model_name: "shared-model", reasoning_effort: "high" },
      "compatible-only": { model_name: "compatible-only-model" },
      "native-model": { model_name: "native-model" },
    },
    mcp: { servers: {} },
    env: { variables: {} },
    agents: { agents: {} },
    plugins: { plugins: [] },
  };
}

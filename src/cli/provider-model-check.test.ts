import { describe, expect, test } from "bun:test";
import type { ModelsYaml, ProviderSource } from "../types.ts";
import { checkProviderModels } from "./provider-model-check.ts";

describe("provider model availability check", () => {
  test("checks configured upstream model names against provider /models response", async () => {
    const results = await checkProviderModels({
      providers: providersFixture(),
      models: modelsFixture(),
      env: {
        CODEXAPIS_API_KEY: "test-key",
      },
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.4-mini" }] }), { status: 200 }),
        ),
    });

    expect(results).toEqual([
      {
        provider: "codexapis",
        base_url: "https://example.test/v1",
        status: "ok",
        checked_model_names: ["gpt-5.4-mini", "gpt-5.5"],
        missing_model_names: [],
      },
    ]);
  });

  test("reports missing models and missing provider api keys", async () => {
    const results = await checkProviderModels({
      providers: {
        ...providersFixture(),
        deepseek: {
          base_url: "https://deepseek.example.test",
          api_key: "${DEEPSEEK_API_KEY}",
        },
      },
      models: {
        ...modelsFixture(),
        "deepseek-v4": {
          provider: "deepseek",
          model_name: "deepseek-v4",
        },
      },
      env: {
        CODEXAPIS_API_KEY: "test-key",
      },
      fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), { status: 200 })),
    });

    expect(results).toContainEqual({
      provider: "codexapis",
      base_url: "https://example.test/v1",
      status: "missing-models",
      checked_model_names: ["gpt-5.4-mini", "gpt-5.5"],
      missing_model_names: ["gpt-5.4-mini"],
    });
    expect(results).toContainEqual({
      provider: "deepseek",
      base_url: "https://deepseek.example.test",
      status: "missing-api-key",
      checked_model_names: ["deepseek-v4"],
      missing_model_names: ["deepseek-v4"],
      error: "缺少环境变量：DEEPSEEK_API_KEY",
    });
  });
});

function providersFixture(): Record<string, ProviderSource> {
  return {
    codexapis: {
      base_url: "https://example.test/v1",
      api_key: "${CODEXAPIS_API_KEY}",
    },
  };
}

function modelsFixture(): ModelsYaml {
  return {
    "gpt-5.5": {
      provider: "codexapis",
      model_name: "gpt-5.5",
    },
    "gpt-5.4-mini": {
      provider: "codexapis",
      model_name: "gpt-5.4-mini",
    },
  };
}

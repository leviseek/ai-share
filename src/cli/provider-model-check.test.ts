import { describe, expect, test } from "bun:test";
import type { ModelsYaml, ProviderSource } from "../types.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-model-check.ts";

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

  test("runs canary completions with model parameters", async () => {
    const requests: unknown[] = [];
    const results = await checkProviderCanaries({
      providers: providersFixture(),
      models: {
        "gpt-5.5": {
          provider: "codexapis",
          model_name: "gpt-5.5",
          temperature: 0.2,
          parameters: {
            reasoningEffort: "medium",
          },
        },
      },
      env: {
        CODEXAPIS_API_KEY: "test-key",
      },
      fetchImpl: (_url, init) => {
        if (typeof init.body !== "string") throw new Error("expected JSON request body");
        requests.push(JSON.parse(init.body));
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
        );
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(results[0]).toMatchObject({
      provider: "codexapis",
      model_id: "gpt-5.5",
      model_name: "gpt-5.5",
      base_url: "https://example.test/v1",
      status: "ok",
    });
    expect(requests[0]).toMatchObject({
      model: "gpt-5.5",
      max_tokens: 1,
      temperature: 0.2,
      reasoning_effort: "medium",
    });
  });

  test("keeps same upstream model canaries when parameters differ", async () => {
    const requests: unknown[] = [];
    const results = await checkProviderCanaries({
      providers: providersFixture(),
      models: {
        "gpt-5.5": {
          provider: "codexapis",
          model_name: "gpt-5.5",
          temperature: 0.2,
          parameters: {
            reasoningEffort: "medium",
          },
        },
        "gpt-5.5-coding": {
          provider: "codexapis",
          model_name: "gpt-5.5",
          temperature: 0.1,
          parameters: {
            reasoningEffort: "high",
          },
        },
      },
      env: {
        CODEXAPIS_API_KEY: "test-key",
      },
      fetchImpl: (_url, init) => {
        if (typeof init.body !== "string") throw new Error("expected JSON request body");
        requests.push(JSON.parse(init.body));
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
        );
      },
    });

    expect(results.map((result) => result.model_id)).toEqual(["gpt-5.5", "gpt-5.5-coding"]);
    expect(new Set(results.map((result) => result.request_fingerprint)).size).toBe(2);
    expect(requests).toHaveLength(2);
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

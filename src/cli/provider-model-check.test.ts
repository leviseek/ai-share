import { describe, expect, test } from "bun:test";
import type { ModelsYaml, ProviderSource } from "../types.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-model-check.ts";

describe("provider model availability check", () => {
  test("checks every configured upstream model name against the selected provider", async () => {
    const results = await checkProviderModels({
      providerId: "codexapis",
      provider: providerFixture(),
      models: modelsFixture(),
      env: { CODEXAPIS_API_KEY: "test-key" },
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.6-luna" }] }), {
            status: 200,
          }),
        ),
    });

    expect(results).toEqual([
      {
        provider: "codexapis",
        base_url: "https://example.test/v1",
        status: "ok",
        checked_model_names: ["gpt-5.5", "gpt-5.6-luna"],
        missing_model_names: [],
      },
    ]);
  });

  test("reports missing models and a missing API key without making a request", async () => {
    let requests = 0;
    const missingKey = await checkProviderModels({
      providerId: "codexapis",
      provider: providerFixture(),
      models: modelsFixture(),
      env: {},
      fetchImpl: () => {
        requests += 1;
        return Promise.reject(new Error("must not request"));
      },
    });
    expect(requests).toBe(0);
    expect(missingKey[0]).toMatchObject({
      status: "missing-api-key",
      error: "缺少环境变量：CODEXAPIS_API_KEY",
    });

    const missingModel = await checkProviderModels({
      providerId: "codexapis",
      provider: providerFixture(),
      models: modelsFixture(),
      env: { CODEXAPIS_API_KEY: "test-key" },
      fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), { status: 200 })),
    });
    expect(missingModel[0]).toMatchObject({
      status: "missing-models",
      missing_model_names: ["gpt-5.6-luna"],
    });
  });

  test("uses a minimal canary request and deduplicates upstream aliases", async () => {
    const requests: unknown[] = [];
    const results = await checkProviderCanaries({
      providerId: "codexapis",
      provider: providerFixture(),
      models: {
        "gpt-5.5": { model_name: "gpt-5.5", reasoning_effort: "medium" },
        "gpt-5.5-coding": { model_name: "gpt-5.5", reasoning_effort: "high" },
      },
      env: { CODEXAPIS_API_KEY: "test-key" },
      fetchImpl: (_url, init) => {
        if (typeof init.body !== "string") throw new Error("expected JSON request body");
        requests.push(JSON.parse(init.body) as unknown);
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
        );
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      provider: "codexapis",
      model_id: "gpt-5.5",
      model_name: "gpt-5.5",
      status: "ok",
    });
    expect(results[0]?.request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(requests).toEqual([
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "Reply with ok." }],
        max_tokens: 1,
      },
    ]);
  });
});

function providerFixture(): ProviderSource {
  return {
    base_url: "https://example.test/v1",
    api_key: "${CODEXAPIS_API_KEY}",
  };
}

function modelsFixture(): ModelsYaml {
  return {
    "gpt-5.5": { model_name: "gpt-5.5" },
    "gpt-5.5-coding": { model_name: "gpt-5.5", reasoning_effort: "high" },
    "gpt-5.6-luna": { model_name: "gpt-5.6-luna", reasoning_effort: "low" },
  };
}

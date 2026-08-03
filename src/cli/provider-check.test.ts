import { describe, expect, test } from "bun:test";
import type { ModelsYaml, ProviderSource } from "../types.ts";
import { checkProviderCanaries, checkProviderModels } from "./provider-check.ts";

const models: ModelsYaml = {
  "gpt-main": { model_name: "gpt-5.6-sol" },
  "gpt-main-coding": { model_name: "gpt-5.6-sol" },
  "deepseek-flash": { model_name: "deepseek-v4-flash" },
  "deepseek-flash-coding": { model_name: "deepseek-v4-flash" },
  "deepseek-pro": { model_name: "deepseek-v4-pro" },
};

describe("provider-associated online checks", () => {
  test("checks only unique upstream model names associated with the selected provider", async () => {
    const requests: { input: string; init: RequestInit }[] = [];

    const results = await checkProviderModels({
      providerId: "deepseek",
      provider: createProvider("DEEPSEEK_API_KEY"),
      modelIds: ["deepseek-pro", "deepseek-flash-coding", "deepseek-flash"],
      models,
      env: { DEEPSEEK_API_KEY: "test-key" },
      fetchImpl: (input, init) => {
        requests.push({ input, init });
        return Promise.resolve(Response.json({ data: [{ id: "deepseek-v4-flash" }, { id: "deepseek-v4-pro" }] }));
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("https://provider.example.com/v1/models");
    expect(requests[0]?.init.method).toBeUndefined();
    expect(results).toEqual([
      {
        provider: "deepseek",
        base_url: "https://provider.example.com/v1",
        status: "ok",
        checked_model_names: ["deepseek-v4-flash", "deepseek-v4-pro"],
        missing_model_names: [],
      },
    ]);
  });

  test("canaries check unique associated upstream names and retain the first alias", async () => {
    const requests: { input: string; body: unknown }[] = [];

    const results = await checkProviderCanaries({
      providerId: "deepseek",
      provider: createProvider("DEEPSEEK_API_KEY"),
      modelIds: ["deepseek-flash-coding", "deepseek-flash", "deepseek-pro"],
      models,
      env: { DEEPSEEK_API_KEY: "test-key" },
      fetchImpl: (input, init) => {
        requests.push({ input, body: parseJsonBody(init.body) });
        return Promise.resolve(Response.json({ choices: [] }));
      },
    });

    expect(requests).toEqual([
      {
        input: "https://provider.example.com/v1/chat/completions",
        body: {
          model: "deepseek-v4-flash",
          messages: [{ role: "user", content: "Reply with ok." }],
          max_tokens: 1,
        },
      },
      {
        input: "https://provider.example.com/v1/chat/completions",
        body: {
          model: "deepseek-v4-pro",
          messages: [{ role: "user", content: "Reply with ok." }],
          max_tokens: 1,
        },
      },
    ]);
    expect(results.map(({ model_id, model_name, status }) => ({ model_id, model_name, status }))).toEqual([
      { model_id: "deepseek-flash-coding", model_name: "deepseek-v4-flash", status: "ok" },
      { model_id: "deepseek-pro", model_name: "deepseek-v4-pro", status: "ok" },
    ]);
  });

  test("GPT providers do not send DeepSeek model checks", async () => {
    const requests: { input: string; body: unknown }[] = [];
    const provider = createProvider("GPT_API_KEY");
    const common = {
      providerId: "gpt",
      provider,
      modelIds: ["gpt-main", "gpt-main-coding"],
      models,
      env: { GPT_API_KEY: "test-key" },
      fetchImpl: (input: string, init: RequestInit) => {
        requests.push({ input, body: init.body === undefined ? undefined : parseJsonBody(init.body) });
        return Promise.resolve(
          input.endsWith("/models") ? Response.json({ data: [{ id: "gpt-5.6-sol" }] }) : Response.json({ choices: [] }),
        );
      },
    };

    const modelResults = await checkProviderModels(common);
    const canaryResults = await checkProviderCanaries(common);

    expect(requests).toHaveLength(2);
    expect(requests).toEqual([
      { input: "https://provider.example.com/v1/models", body: undefined },
      {
        input: "https://provider.example.com/v1/chat/completions",
        body: {
          model: "gpt-5.6-sol",
          messages: [{ role: "user", content: "Reply with ok." }],
          max_tokens: 1,
        },
      },
    ]);
    expect(modelResults[0]?.checked_model_names).toEqual(["gpt-5.6-sol"]);
    expect(canaryResults.map((result) => result.model_name)).toEqual(["gpt-5.6-sol"]);
  });

  test("rejects unknown associated model IDs before requesting models", async () => {
    let requestCount = 0;

    const promise = checkProviderModels({
      providerId: "deepseek",
      provider: createProvider("DEEPSEEK_API_KEY"),
      modelIds: ["missing-model"],
      models,
      env: { DEEPSEEK_API_KEY: "test-key" },
      fetchImpl: () => {
        requestCount += 1;
        return Promise.resolve(Response.json({ data: [] }));
      },
    });

    expect(promise).rejects.toThrow("模型未定义：missing-model");
    await promise.catch(() => undefined);
    expect(requestCount).toBe(0);
  });

  test("rejects unknown associated model IDs before requesting canaries", async () => {
    let requestCount = 0;

    const promise = checkProviderCanaries({
      providerId: "deepseek",
      provider: createProvider("DEEPSEEK_API_KEY"),
      modelIds: ["missing-model"],
      models,
      env: { DEEPSEEK_API_KEY: "test-key" },
      fetchImpl: () => {
        requestCount += 1;
        return Promise.resolve(Response.json({ choices: [] }));
      },
    });

    expect(promise).rejects.toThrow("模型未定义：missing-model");
    await promise.catch(() => undefined);
    expect(requestCount).toBe(0);
  });
});

function createProvider(apiKeyEnv: string): ProviderSource {
  return {
    base_url: "https://provider.example.com/v1",
    api_key: `\${${apiKeyEnv}}`,
    models: [],
    default_model: "unused",
  };
}

function parseJsonBody(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") throw new Error("Expected a JSON string request body");
  return JSON.parse(body) as unknown;
}

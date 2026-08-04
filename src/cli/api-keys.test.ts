import { describe, expect, test } from "bun:test";
import type { ProviderSource } from "../types.ts";
import { missingProviderApiKeyEnvName, missingProviderApiKeyEnvNames } from "./api-keys.ts";

describe("missingProviderApiKeyEnvName", () => {
  test("returns undefined when the env var is set", () => {
    expect(missingProviderApiKeyEnvName(provider("A_KEY"), { A_KEY: "secret" })).toBeUndefined();
  });

  test("returns the env name when the env var is missing", () => {
    expect(missingProviderApiKeyEnvName(provider("A_KEY"), {})).toBe("A_KEY");
  });

  test("returns undefined when the api key is not an env reference", () => {
    expect(missingProviderApiKeyEnvName(provider("inline"), {})).toBeUndefined();
  });
});

describe("missingProviderApiKeyEnvNames", () => {
  test("collects missing env names across multiple providers", () => {
    const providers = [provider("A_KEY"), provider("B_KEY"), provider("C_KEY")];

    expect(missingProviderApiKeyEnvNames(providers, { B_KEY: "secret" })).toEqual(["A_KEY", "C_KEY"]);
  });

  test("returns empty when all providers have their env vars set", () => {
    const providers = [provider("A_KEY"), provider("B_KEY")];

    expect(missingProviderApiKeyEnvNames(providers, { A_KEY: "secret", B_KEY: "secret" })).toEqual([]);
  });

  test("deduplicates shared env names across providers", () => {
    const providers = [provider("A_KEY"), provider("A_KEY")];

    expect(missingProviderApiKeyEnvNames(providers, {})).toEqual(["A_KEY"]);
  });

  test("ignores providers without env references", () => {
    const providers = [provider("A_KEY"), provider("inline")];

    expect(missingProviderApiKeyEnvNames(providers, {})).toEqual(["A_KEY"]);
  });
});

function provider(apiKey: string): ProviderSource {
  return {
    base_url: "https://example.com/v1",
    api_key: `\${${apiKey}}`,
    models: ["model-a"],
    default_model: "model-a",
  };
}

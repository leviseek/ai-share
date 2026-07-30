import { describe, expect, test } from "bun:test";
import { missingProviderApiKeyEnvName } from "./api-keys.ts";

describe("selected provider API key", () => {
  test("checks only the selected provider environment reference", () => {
    const provider = { base_url: "https://example.test/v1", api_key: "${EXAMPLE_API_KEY}" };
    expect(missingProviderApiKeyEnvName(provider, {})).toBe("EXAMPLE_API_KEY");
    expect(missingProviderApiKeyEnvName(provider, { EXAMPLE_API_KEY: "configured" })).toBeUndefined();
  });
});

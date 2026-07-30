import { describe, expect, test } from "bun:test";
import type { ProviderYaml } from "../types.ts";
import { missingProviderApiKeyEnvNames } from "./api-keys.ts";

describe("missingProviderApiKeyEnvNames", () => {
  test("reports missing referenced env vars without throwing on malformed provider keys", () => {
    const providers = {
      valid: {
        base_url: "https://example.test/v1",
        api_key: "${AI_SHARE_TEST_MISSING_KEY}",
      },
      malformed: {
        base_url: "https://example.test/v1",
        api_key: "plain-secret",
      },
    } satisfies ProviderYaml["providers"];

    expect(missingProviderApiKeyEnvNames(providers)).toEqual(["AI_SHARE_TEST_MISSING_KEY"]);
  });
});

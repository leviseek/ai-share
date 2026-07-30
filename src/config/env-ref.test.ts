import { describe, expect, test } from "bun:test";
import { envReferenceName, isEnvReference, requireEnvReferenceName } from "./env-ref.ts";

describe("env reference helpers", () => {
  test("extracts environment variable names from placeholder references", () => {
    expect(envReferenceName("${CODEXAPIS_API_KEY}")).toBe("CODEXAPIS_API_KEY");
    expect(isEnvReference("${PACKYAPI_API_KEY}")).toBe(true);
  });

  test("rejects malformed or lowercase environment references", () => {
    expect(envReferenceName("$CODEXAPIS_API_KEY")).toBeUndefined();
    expect(envReferenceName("${lowercase_key}")).toBeUndefined();
    expect(isEnvReference("sk-real-looking-value")).toBe(false);
  });

  test("throws user-facing errors for missing or invalid required references", () => {
    expect(() => requireEnvReferenceName(undefined, "providers.codexapis.api_key")).toThrow(
      "缺少必要配置字段：providers.codexapis.api_key",
    );
    expect(() => requireEnvReferenceName("plain-secret", "providers.codexapis.api_key")).toThrow(
      "providers.codexapis.api_key 必须使用 ${ENV_NAME} 格式：plain-secret",
    );
  });
});

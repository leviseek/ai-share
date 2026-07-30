import { describe, expect, test } from "bun:test";
import { isSensitiveName, looksLikeSecretLiteral } from "./secret-patterns.ts";

describe("secret pattern helpers", () => {
  test("detects sensitive variable names", () => {
    expect(isSensitiveName("CODEXAPIS_API_KEY")).toBe(true);
    expect(isSensitiveName("session_cookie")).toBe(true);
    expect(isSensitiveName("HTTP_PROXY")).toBe(false);
  });

  test("detects common secret literal formats in lines", () => {
    expect(looksLikeSecretLiteral("OPENAI_API_KEY=sk-1234567890abcdef")).toBe(true);
    expect(looksLikeSecretLiteral("token: github_pat_1234567890abcdefghijklmnop")).toBe(true);
    expect(looksLikeSecretLiteral("env var name CODEXAPIS_API_KEY only")).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { parseJsonc } from "./jsonc.ts";

describe("parseJsonc", () => {
  test("supports line comments, block comments, and trailing commas", () => {
    expect(
      parseJsonc(`{
        // a leading comment
        "name": "value",
        /* an inline block comment */
        "items": [1, 2,],
      }`),
    ).toEqual({ name: "value", items: [1, 2] });
  });

  test("does not strip comment-like text inside strings", () => {
    expect(parseJsonc('{"url":"https://example.test/a//b", "text":"/* keep */",}')).toEqual({
      url: "https://example.test/a//b",
      text: "/* keep */",
    });
  });

  test("reports an unterminated block comment", () => {
    expect(() => parseJsonc('{/* missing end\n"value": true}')).toThrow("JSONC 注释未闭合");
  });
});

import { describe, expect, test } from "bun:test";
import { createColor } from "./color.ts";
import { buildProviderChoices, createProviderSelectionState, renderProviderMenu } from "./provider-select.ts";

describe("Provider menu rendering", () => {
  const choices = buildProviderChoices({
    codexapis: {
      name: "Codex APIs",
      base_url: "https://codex.example.test/v1",
      api_key: "${K}",
      models: ["m"],
      default_model: "m",
    },
    deepseek: {
      name: "DeepSeek",
      base_url: "https://deepseek.example.test/v1",
      api_key: "${K}",
      models: ["m"],
      default_model: "m",
    },
  });

  test("renders plain text by default", () => {
    const state = createProviderSelectionState(choices, "codexapis");
    const output = renderProviderMenu(choices, state);
    expect(output).toContain("请选择 Provider");
    expect(output).toContain("> 1. Codex APIs (codexapis)");
    expect(output).toContain("  2. DeepSeek (deepseek)");
    expect(output).toContain("当前选择：1");
    expect(output).not.toContain("\u001b");
  });

  test("marks invalid index in red", () => {
    const state = createProviderSelectionState(choices, "codexapis");
    state.numericInput = "9";
    const palette = createColor(true);
    const output = renderProviderMenu(choices, state, true, palette);
    expect(output).toContain("\u001b[31m"); // red invalid
    expect(output).toContain("索引无效：9");
  });

  test("wraps title and focused choice in ANSI when colored", () => {
    const state = createProviderSelectionState(choices, "deepseek");
    const palette = createColor(true);
    const output = renderProviderMenu(choices, state, false, palette);
    expect(output).toContain("\u001b[36m"); // cyan title
    expect(output).toContain("\u001b[32m"); // green focused
  });
});

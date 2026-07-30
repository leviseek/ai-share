import { describe, expect, test } from "bun:test";
import {
  parseCliOptions,
  resolveProviderDecision,
  resolveProviderId,
  resolveTaskDecision,
  resolveTaskDescription,
} from "./options.ts";

describe("generation CLI options", () => {
  test("parses the supported generation interface", () => {
    expect(parseCliOptions(["bun", "script", "--provider", "packyapi", "--task=memory", "--force"])).toEqual({
      force: true,
      dryRun: false,
      provider: "packyapi",
      task: "memory",
    });
  });

  test("resolves provider precedence", () => {
    expect(resolveProviderId({ cliProvider: "cli", envProvider: "env", defaultProvider: "default" })).toBe("cli");
    expect(resolveProviderId({ envProvider: "env", defaultProvider: "default" })).toBe("env");
    expect(resolveProviderId({ defaultProvider: "default" })).toBe("default");
    expect(resolveProviderDecision({ cliProvider: "cli", envProvider: "env", defaultProvider: "default" })).toEqual({
      id: "cli",
      source: "cli",
    });
    expect(resolveProviderDecision({ envProvider: "env", defaultProvider: "default" })).toEqual({
      id: "env",
      source: "environment",
    });
    expect(resolveProviderDecision({ defaultProvider: "default" })).toEqual({
      id: "default",
      source: "global-config",
    });
  });

  test("resolves task precedence", () => {
    expect(resolveTaskDescription({ cliTask: "cli task", envTask: "env task" })).toBe("cli task");
    expect(resolveTaskDescription({ envTask: "env task" })).toBe("env task");
    expect(resolveTaskDescription({})).toBeUndefined();
    expect(resolveTaskDecision({ cliTask: "cli task", envTask: "env task" })).toEqual({
      value: "cli task",
      source: "cli",
    });
    expect(resolveTaskDecision({ envTask: "env task" })).toEqual({ value: "env task", source: "environment" });
    expect(resolveTaskDecision({})).toEqual({ source: "none" });
  });

  test("rejects removed and unknown options", () => {
    expect(() => parseCliOptions(["bun", "script", "--gpt-provider", "legacy"])).toThrow("未知参数");
    expect(() => parseCliOptions(["bun", "script", "--provider"])).toThrow("缺少参数值");
    expect(() => parseCliOptions(["bun", "script", "--provider="])).toThrow("缺少参数值");
  });
});

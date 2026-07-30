import { describe, expect, test } from "bun:test";
import { parseCliOptions, resolveProviderId, resolveTaskDescription } from "./options.ts";

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
  });

  test("resolves task precedence", () => {
    expect(resolveTaskDescription({ cliTask: "cli task", envTask: "env task" })).toBe("cli task");
    expect(resolveTaskDescription({ envTask: "env task" })).toBe("env task");
    expect(resolveTaskDescription({})).toBeUndefined();
  });

  test("rejects removed and unknown options", () => {
    expect(() => parseCliOptions(["bun", "script", "--gpt-provider", "legacy"])).toThrow("未知参数");
    expect(() => parseCliOptions(["bun", "script", "--provider"])).toThrow("缺少参数值");
    expect(() => parseCliOptions(["bun", "script", "--provider="])).toThrow("缺少参数值");
  });
});

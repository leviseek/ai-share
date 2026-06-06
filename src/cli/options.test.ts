import { describe, expect, test } from "bun:test";
import { parseCliOptions } from "./options.ts";

describe("parseCliOptions", () => {
  test("uses one explicit provider for all default model groups", () => {
    const options = parseCliOptions(["bun", "src/generate-user-config.ts", "--provider", "packyapi"], {});

    expect(options.providerGroupsSpecified).toBe(true);
    expect(options.providerGroups).toMatchObject({
      gpt: "packyapi",
      deepseek: "packyapi",
    });
  });

  test("lets group-specific provider options override the shared provider", () => {
    const options = parseCliOptions(
      ["bun", "src/generate-user-config.ts", "--provider", "packyapi", "--deepseek-provider", "deepseek"],
      {},
    );

    expect(options.providerGroups).toMatchObject({
      gpt: "packyapi",
      deepseek: "deepseek",
    });
  });
});

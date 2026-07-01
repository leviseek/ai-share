import { describe, expect, test } from "bun:test";
import { parseCliOptions } from "./options.ts";

describe("parseCliOptions", () => {
  test("uses one explicit provider for the GPT model group", () => {
    const options = parseCliOptions(["bun", "src/generate-user-config.ts", "--provider", "packyapi"], {});

    expect(options.providerGroupsSpecified).toBe(true);
    expect(options.providerGroups).toMatchObject({
      gpt: "packyapi",
    });
  });

  test("lets the GPT-specific provider option override the shared provider", () => {
    const options = parseCliOptions(
      ["bun", "src/generate-user-config.ts", "--provider", "packyapi", "--gpt-provider", "axasapi"],
      {},
    );

    expect(options.providerGroups).toMatchObject({
      gpt: "axasapi",
    });
  });
});

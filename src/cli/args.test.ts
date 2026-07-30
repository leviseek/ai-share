import { describe, expect, test } from "bun:test";
import { argsFromArgv, hasFlag, parseBooleanOption, parseOptionValue, parseOptionValues } from "./args.ts";

describe("cli args helpers", () => {
  test("normalizes argv and detects flags", () => {
    const args = argsFromArgv(["bun", "script.ts", "--json", "--output", "report.json"]);

    expect(args).toEqual(["--json", "--output", "report.json"]);
    expect(hasFlag(args, "--json")).toBe(true);
    expect(hasFlag(args, "--missing")).toBe(false);
  });

  test("parses option values in space and equals forms", () => {
    const args = ["--output", "report.json", "--provider=codexapis"];

    expect(parseOptionValue(args, "--output")).toBe("report.json");
    expect(parseOptionValue(args, "--provider")).toBe("codexapis");
    expect(parseOptionValue(args, "--missing")).toBeUndefined();
  });

  test("handles missing option values according to caller policy", () => {
    expect(parseOptionValue(["--backup"], "--backup", { missingValue: "true" })).toBe("true");
    expect(parseOptionValue(["--backup"], "--backup")).toBeUndefined();
    expect(parseOptionValue(["--provider", "--dry-run"], "--provider")).toBeUndefined();
    expect(() => parseOptionValue(["--provider-group"], "--provider-group", { missingValue: "error" })).toThrow(
      "缺少参数值：--provider-group",
    );
    expect(() =>
      parseOptionValue(["--provider-group", "--dry-run"], "--provider-group", { missingValue: "error" }),
    ).toThrow("缺少参数值：--provider-group");
  });

  test("parses repeated options and boolean values", () => {
    expect(parseOptionValues(["--provider-group", "gpt=a", "--provider-group=gpt=b"], "--provider-group")).toEqual([
      "gpt=a",
      "gpt=b",
    ]);
    expect(parseBooleanOption("--backup", "yes")).toBe(true);
    expect(parseBooleanOption("--backup", "0")).toBe(false);
    expect(() => parseBooleanOption("--backup", "maybe")).toThrow("--backup 只支持 true/false：maybe");
    expect(() => parseOptionValues(["--provider-group", "--dry-run"], "--provider-group")).toThrow(
      "缺少参数值：--provider-group",
    );
  });
});

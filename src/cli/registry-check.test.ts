import { describe, expect, test } from "bun:test";
import { checkVersions, versionCheckOk } from "./registry-check.ts";

describe("versionCheckOk", () => {
  test("checks the configured OpenCode minimum with the opencode command", () => {
    const commands: string[] = [];
    expect(
      checkVersions({ model: "model", provider: "provider", opencode_min_version: "1.18.11" }, (command) => {
        commands.push(command);
        return "1.18.12";
      }),
    ).toEqual([
      {
        name: "OpenCode CLI",
        field: "opencode_min_version",
        current: "1.18.12",
        minimum: "1.18.11",
        ok: true,
      },
    ]);
    expect(commands).toEqual(["opencode"]);
  });
  test("treats unknown versions as warnings instead of passing", () => {
    expect(versionCheckOk("unknown", "0.23.0")).toBe(false);
  });

  test("compares semver triples against the configured minimum", () => {
    expect(versionCheckOk("0.137.0", "0.134.0")).toBe(true);
    expect(versionCheckOk("0.134.0", "0.134.0")).toBe(true);
    expect(versionCheckOk("0.133.9", "0.134.0")).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { versionCheckOk } from "./registry-check.ts";

describe("versionCheckOk", () => {
  test("treats unknown versions as warnings instead of passing", () => {
    expect(versionCheckOk("unknown", "0.23.0")).toBe(false);
  });

  test("compares semver triples against the configured minimum", () => {
    expect(versionCheckOk("0.137.0", "0.134.0")).toBe(true);
    expect(versionCheckOk("0.134.0", "0.134.0")).toBe(true);
    expect(versionCheckOk("0.133.9", "0.134.0")).toBe(false);
  });
});

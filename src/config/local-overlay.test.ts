import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfigYamlSync, mergeLocalOverlay } from "./local-overlay.ts";

describe("local config overlay", () => {
  test("deep merges local objects and replaces arrays/scalars", () => {
    expect(
      mergeLocalOverlay(
        {
          providers: {
            a: {
              base_url: "https://a.test",
              flags: ["base"],
            },
          },
          default_profile: "balanced",
        },
        {
          providers: {
            a: {
              flags: ["local"],
              api_key: "${LOCAL_KEY}",
            },
          },
          default_profile: "coding",
        },
      ),
    ).toEqual({
      providers: {
        a: {
          base_url: "https://a.test",
          flags: ["local"],
          api_key: "${LOCAL_KEY}",
        },
      },
      default_profile: "coding",
    });
  });

  test("loads config/local overlay when present", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-overlay-"));
    try {
      mkdirSync(join(root, "local"), { recursive: true });
      writeFileSync(join(root, "global.yaml"), "default_profile: balanced\n", "utf8");
      writeFileSync(join(root, "local", "global.yaml"), "default_profile: coding\n", "utf8");

      expect(loadConfigYamlSync(root, "global.yaml")).toEqual({
        default_profile: "coding",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

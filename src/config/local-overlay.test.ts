import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listLocalConfigOverlaysSync, loadConfigYamlSync, mergeLocalOverlay } from "./local-overlay.ts";

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
          model: "gpt-5.6-luna",
        },
        {
          providers: {
            a: {
              flags: ["local"],
              api_key: "${LOCAL_KEY}",
            },
          },
          model: "gpt-5.5",
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
      model: "gpt-5.5",
    });
  });

  test("loads config/local overlay when present", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-overlay-"));
    try {
      mkdirSync(join(root, "local"), { recursive: true });
      writeFileSync(join(root, "global.yaml"), "model: gpt-5.6-luna\n", "utf8");
      writeFileSync(join(root, "local", "global.yaml"), "model: gpt-5.5\n", "utf8");
      writeFileSync(join(root, "local", "notes.txt"), "ignored\n", "utf8");
      writeFileSync(join(root, "local", "provider.yml"), "providers: {}\n", "utf8");

      expect(loadConfigYamlSync(root, "global.yaml")).toEqual({
        model: "gpt-5.5",
      });
      expect(listLocalConfigOverlaysSync(root)).toEqual(["config/local/global.yaml", "config/local/provider.yml"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

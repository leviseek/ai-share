import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadWezTermConfig } from "./wezterm.ts";
import { buildYamlJsonSchemas } from "./schema.ts";
import type { WezTermConfig } from "../types.ts";

const configDir = resolve(import.meta.dirname, "..", "..", "config");
const defaults: WezTermConfig = {
  shell: "platform-native",
  color_scheme: "catppuccin-mocha",
  font_size: 12,
  window_background_opacity: 0.94,
  maximize_on_startup: false,
  scrollback_lines: 100000,
};

describe("WezTerm configuration", () => {
  test("loads the authoritative defaults", async () => {
    expect(await loadWezTermConfig(configDir)).toEqual(defaults);
  });

  test("rejects missing fields with Chinese validation errors", async () => {
    await withConfig("color_scheme: catppuccin-mocha\n", async (directory) => {
      await expectLoadError(directory, "缺少 shell 字段");
    });
  });

  test("rejects unknown fields with Chinese validation errors", async () => {
    await withConfig(`${yamlFor(defaults)}unexpected: true\n`, async (directory) => {
      await expectLoadError(directory, "unexpected 是未知字段");
    });
  });

  test.each([
    ["shell", "unsupported-shell"],
    ["color_scheme", "unsupported-theme"],
    ["font_size", 14],
    ["window_background_opacity", 0.5],
    ["maximize_on_startup", "yes"],
    ["scrollback_lines", 5000],
  ])("rejects an unsupported %s value", async (field, value) => {
    const config = { ...defaults, [field]: value };
    await withConfig(yamlFor(config), async (directory) => {
      await expectLoadError(directory, field);
    });
  });

  test("does not load a local WezTerm overlay", async () => {
    await withConfig(yamlFor(defaults), async (directory) => {
      mkdirSync(join(directory, "local"));
      writeFileSync(join(directory, "local", "wezterm.yaml"), "unexpected: true\n", "utf8");

      expect(await loadWezTermConfig(directory)).toEqual(defaults);
    });
  });
});

test("WezTerm JSON Schema carries the strict required fields and numeric enums", () => {
  const schema = buildYamlJsonSchemas()["wezterm.schema.json"];

  expect(schema).toMatchObject({
    type: "object",
    additionalProperties: false,
    required: [
      "shell",
      "color_scheme",
      "font_size",
      "window_background_opacity",
      "maximize_on_startup",
      "scrollback_lines",
    ],
    properties: {
      shell: { type: "string", enum: ["platform-native", "wezterm-default"] },
      color_scheme: {
        type: "string",
        enum: ["catppuccin-mocha", "dracula", "tokyo-night", "wezterm-default"],
      },
      font_size: { type: "number", enum: [11, 12, 13] },
      window_background_opacity: { type: "number", enum: [0.88, 0.94, 1] },
      maximize_on_startup: { type: "boolean" },
      scrollback_lines: { type: "number", enum: [10000, 100000, 1000000] },
    },
  });
});

async function withConfig(content: string, callback: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "ai-share-wezterm-"));
  writeFileSync(join(directory, "wezterm.yaml"), content, "utf8");
  try {
    await callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function yamlFor(config: object): string {
  return (
    Object.entries(config)
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : String(value)}`)
      .join("\n") + "\n"
  );
}

async function expectLoadError(directory: string, message: string): Promise<void> {
  let thrown: unknown;
  try {
    await loadWezTermConfig(directory);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  if (!(thrown instanceof Error)) throw new Error("预期 WezTerm 配置加载失败。");
  expect(thrown.message).toContain(message);
}

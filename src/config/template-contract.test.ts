import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { buildCodexCliConfig, formatCodexConfigToml } from "../config-builders.ts";
import { loadValidatedConfig } from "./load.ts";

const projectRoot = resolve(import.meta.dir, "..", "..");

describe("shareable config template", () => {
  test("passes the same loader, validation and builder pipeline as the main config", async () => {
    const config = await loadValidatedConfig(resolve(projectRoot, "templates", "shareable", "config"));
    const output = formatCodexConfigToml(
      buildCodexCliConfig(config, config.global.provider, "/example/CODEX_HOME/AGENTS.md"),
    );
    expect(config.global.provider).toBe("example-openai-compatible");
    expect(output).toContain("[model_providers.example-openai-compatible]");
    expect(() => Bun.TOML.parse(output)).not.toThrow();
  });
});

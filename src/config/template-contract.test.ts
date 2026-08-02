import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { buildOpenCodeConfig, formatOpenCodeConfigJsonc } from "../config-builders.ts";
import { loadValidatedConfig } from "./load.ts";

const projectRoot = resolve(import.meta.dir, "..", "..");

describe("shareable config template", () => {
  test("passes the same loader, validation and builder pipeline as the main config", async () => {
    const config = await loadValidatedConfig(resolve(projectRoot, "templates", "shareable", "config"));
    const output = formatOpenCodeConfigJsonc(
      buildOpenCodeConfig(config, config.global.provider, ["/example/AI_GUIDELINES.md"], "/example/skills"),
    );
    expect(config.global.provider).toBe("example-openai-compatible");
    expect(config.plugins).toEqual({ plugins: [] });
    expect(output).toContain('"example-openai-compatible"');
    const parsed = JSON.parse(output.slice(output.indexOf("{"))) as Record<string, unknown>;
    expect(parsed.plugin).toBeUndefined();
  });
});

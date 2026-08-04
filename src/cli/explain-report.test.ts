import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildGenerationPreview } from "../generation-preview.ts";
import { renderExplainReport } from "./explain-output.ts";
import { buildExplainReport } from "./explain-report.ts";

describe("explain report model integration", () => {
  test("reports the provider default model source without secrets or generated content", async () => {
    const fixture = createFixture();
    try {
      const preview = await buildGenerationPreview({
        options: { force: false, dryRun: false, provider: "deepseek" },
        env: fixture.env,
        projectRoot: fixture.root,
        interactiveProviderSelection: false,
      });
      const report = buildExplainReport(preview);

      expect(report.schema_version).toBe(4);
      expect(report.inputs.model).toEqual({
        id: "deepseek-v4-flash",
        model_name: "deepseek-v4-flash",
        source: "provider-default",
        id_source: "config/provider.yaml → providers.deepseek.default_model",
        definition_source: "config/models.yaml → deepseek-v4-flash.model_name",
      });
      expect(renderExplainReport(report, false)).toContain("source=provider-default");
      expect(report.plan.actions.every((entry) => !Reflect.has(entry, "content"))).toBe(true);

      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("TEST_SECRET_VALUE");
      expect(serialized).not.toContain("https://deepseek.example.test/v1");
    } finally {
      fixture.cleanup();
    }
  });

  test("traces the global model source for the default provider", async () => {
    const fixture = createFixture();
    try {
      const preview = await buildGenerationPreview({
        options: { force: false, dryRun: false },
        env: fixture.env,
        projectRoot: fixture.root,
        interactiveProviderSelection: false,
      });
      const report = buildExplainReport(preview);

      expect(report.inputs.model.source).toBe("global-config");
      expect(report.inputs.model.id_source).toBe("config/global.yaml → model");
    } finally {
      fixture.cleanup();
    }
  });
});

function createFixture(): { root: string; env: Record<string, string | undefined>; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "ai-share-explain-report-"));
  write(join(root, "config", "global.yaml"), "model: gpt-5.5\nprovider: codexapis\n");
  write(
    join(root, "config", "provider.yaml"),
    [
      "providers:",
      "  codexapis:",
      "    name: Codex APIs",
      "    base_url: https://codex.example.test/v1",
      "    api_key: ${CODEXAPIS_API_KEY}",
      "    models: [gpt-5.5]",
      "    default_model: gpt-5.5",
      "  deepseek:",
      "    name: DeepSeek",
      "    base_url: https://deepseek.example.test/v1",
      "    api_key: ${DEEPSEEK_API_KEY}",
      "    models: [deepseek-v4-flash]",
      "    default_model: deepseek-v4-flash",
      "",
    ].join("\n"),
  );
  write(
    join(root, "config", "models.yaml"),
    "gpt-5.5:\n  model_name: gpt-5.5\ndeepseek-v4-flash:\n  model_name: deepseek-v4-flash\n",
  );
  write(join(root, "config", "mcp.yaml"), "servers: {}\n");
  write(join(root, "config", "env.yaml"), "variables: {}\n");
  write(join(root, "config", "agents.yaml"), "agents: {}\n");
  write(join(root, "config", "plugins.yaml"), "plugins: []\n");

  return {
    root,
    env: {
      HOME: join(root, "home"),
      OPENCODE_CONFIG_DIR: join(root, "opencode"),
      DEEPSEEK_API_KEY: "TEST_SECRET_VALUE",
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

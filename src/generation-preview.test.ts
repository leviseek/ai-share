import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildGenerationPreview } from "./generation-preview.ts";

describe("generation preview", () => {
  test("builds the exact no-write inputs with provider and task decisions", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-preview-"));
    try {
      writeConfig(root);
      const codexHome = join(root, "codex-home");
      const preview = await buildGenerationPreview({
        options: { force: false },
        env: {
          HOME: join(root, "home"),
          CODEX_HOME: codexHome,
          AI_SHARE_PROVIDER: "provider-a",
          AI_SHARE_TASK: "memory task",
        },
        projectRoot: root,
        providerSelector: () => Promise.resolve("provider-b"),
      });

      expect(preview.providerDecision).toEqual({ id: "provider-b", source: "interactive" });
      expect(preview.taskDecision).toEqual({ value: "memory task", source: "environment" });
      expect(preview.loadedConfig.provenance.global.provider).toBe("config/global.yaml");
      expect(preview.agentTomls.commit).toContain('model = "upstream-model"');
      expect(preview.agentTomls.commit).toContain('model_reasoning_effort = "low"');
      expect(preview.plan.actions.some((action) => action.path === join(codexHome, "agents", "commit.toml"))).toBe(
        true,
      );
      expect(preview.plan.actions.length).toBeGreaterThan(0);
      expect(preview.plan.collisions).toEqual([]);
      expect(existsSync(codexHome)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeConfig(root: string): void {
  write(join(root, "config", "global.yaml"), "model: model-a\nprovider: provider-a\n");
  write(
    join(root, "config", "provider.yaml"),
    [
      "providers:",
      "  provider-a:",
      "    base_url: https://a.example.test/v1",
      "    api_key: ${A_API_KEY}",
      "  provider-b:",
      "    base_url: https://b.example.test/v1",
      "    api_key: ${B_API_KEY}",
      "",
    ].join("\n"),
  );
  write(join(root, "config", "models.yaml"), "model-a:\n  model_name: upstream-model\n");
  write(join(root, "config", "mcp.yaml"), "servers: {}\n");
  write(join(root, "config", "env.yaml"), "variables: {}\n");
  write(
    join(root, "config", "agents.yaml"),
    "agents:\n  commit:\n    description: Commit changes\n    model: model-a\n    reasoning_effort: low\n    developer_instructions: Create a commit.\n",
  );
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

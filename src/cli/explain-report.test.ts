import { describe, expect, test } from "bun:test";
import { buildGenerationPreview } from "../generation-preview.ts";
import { buildExplainReport } from "./explain-report.ts";
import { createExplainTestFixture } from "./explain-test-fixture.ts";

describe("explain report", () => {
  test("projects traced decisions without generated content or environment values", async () => {
    const fixture = createExplainTestFixture();
    try {
      const preview = await buildGenerationPreview({
        options: { force: false, provider: "provider-a", task: "Windows 事务化文件写入" },
        env: fixture.env,
        projectRoot: fixture.root,
        interactiveProviderSelection: false,
      });
      const report = buildExplainReport(preview);

      expect(report.schema_version).toBe(1);
      expect(report.status).toBe("ok");
      expect(report.inputs.provider).toEqual({
        id: "provider-a",
        source: "cli",
        config_source: "config/local/provider.yaml → providers.provider-a.base_url",
        api_key_env: "A_API_KEY",
      });
      expect(report.inputs.model).toEqual({
        id: "model-a",
        model_name: "upstream-model",
        reasoning_effort: "medium",
        id_source: "config/global.yaml → model",
        definition_source: "config/models.yaml → model-a.model_name",
      });
      expect(report.inputs.task).toEqual({ value: "Windows 事务化文件写入", source: "cli" });
      expect(report.config.base_files).toEqual([
        "config/global.yaml",
        "config/provider.yaml",
        "config/models.yaml",
        "config/mcp.yaml",
        "config/env.yaml",
      ]);
      expect(report.config.active_overlays).toEqual(["config/local/provider.yaml", "config/local/env.yaml"]);
      expect(report.config.mcp_server_ids).toEqual(["filesystem"]);
      expect(report.config.managed_env_names).toEqual(["HTTP_PROXY"]);
      expect(report.memory.fixed_paths).toEqual([
        "AI_GUIDELINES.md",
        "memory/policies/ai-execution-contract.md",
        "memory/policies/memory-lifecycle.md",
        "memory/stable/user.yaml",
        "memory/stable/workflows.yaml",
        "memory/stable/devices.yaml",
      ]);
      expect(report.memory.selected[0]?.path).toBe("memory/architecture/windows-transactions.md");
      expect(report.memory.ranked_candidates[0]?.selected).toBe(true);
      expect(report.memory.policy_exclusions).toEqual([
        { path: "memory/distilled/TEMPLATE.md", reason: "template" },
        { path: "memory/distilled/malformed.md", reason: "malformed-distilled" },
        { path: "memory/distilled/unconfirmed.md", reason: "unconfirmed-distilled" },
      ]);
      expect(report.plan.actions.length).toBeGreaterThan(0);
      expect(report.plan.actions.every((entry) => !("content" in entry))).toBe(true);

      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("UNREADABLE_TEST_VALUE_42");
      expect(serialized).not.toContain("http://127.0.0.1:7897");
      expect(serialized).not.toContain("https://local-a.example.test/v1");
    } finally {
      fixture.cleanup();
    }
  });
});

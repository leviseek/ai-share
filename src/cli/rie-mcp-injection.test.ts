import { describe, expect, test } from "bun:test";
import { buildCodexCliConfig, formatCodexConfigToml } from "../config/builders/codex.ts";
import type { GlobalYaml, McpYaml, ModelsYaml, ProviderSource } from "../types.ts";
import { withIsolatedCodexHome } from "./codex-home-fixture.test.ts";
import { buildGeneratorPaths } from "./paths.ts";

const providers: Record<string, ProviderSource> = {
  demo: { base_url: "https://example.test/v1", api_key: "${DEMO_API_KEY}" },
};
const models: ModelsYaml = {
  demo: {
    provider: "demo",
    model_name: "demo",
    cost: { input: 1, output: 1 },
    limits: { context_window: 1000, max_output: 100 },
  },
};
const globalConfig: GlobalYaml = { model: "demo" };
const mcp: McpYaml = {
  servers: { rie: { transport: "stdio", command: "bun", args: ["run", "--cwd", ".", "knowledge:mcp"] } },
};

describe("RIE MCP isolated Codex injection", () => {
  test("builds generated config for isolated CODEX_HOME", async () => {
    await withIsolatedCodexHome((codexHome) => {
      const paths = buildGeneratorPaths(process.cwd());
      const toml = formatCodexConfigToml(
        buildCodexCliConfig(providers, models, globalConfig, mcp, paths.targetCodexInstructions, paths.projectRoot),
      );

      expect(paths.targetCodexConfigDir).toBe(codexHome);
      expect(toml).toContain("[mcp_servers.rie]");
      expect(toml).toContain("knowledge:mcp");
      return Promise.resolve();
    });
  });
});

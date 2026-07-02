import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildCodexCliConfig, formatCodexConfigToml } from "./codex.ts";
import type { GlobalYaml, McpYaml, ModelsYaml, ProviderSource } from "../../types.ts";

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

describe("RIE MCP Codex generation", () => {
  test("generates stdio rie MCP entry with project cwd resolved", () => {
    const projectRoot = join("D:", "repo", "ai-share");
    const mcp: McpYaml = {
      servers: { rie: { transport: "stdio", command: "bun", args: ["run", "--cwd", ".", "knowledge:mcp"] } },
    };

    const config = buildCodexCliConfig(providers, models, globalConfig, mcp, "AGENTS.md", projectRoot);
    const toml = formatCodexConfigToml(config);

    expect(toml).toContain("[mcp_servers.rie]");
    expect(toml).toContain('command = "bun"');
    expect(toml).toContain(`args = ["run", "--cwd", ${JSON.stringify(projectRoot)}, "knowledge:mcp"]`);
  });

  test("preserves unrelated MCP server entries next to rie", () => {
    const mcp: McpYaml = {
      servers: {
        docs: { transport: "stdio", command: "node", args: ["server.js"] },
        rie: { transport: "stdio", command: "bun", args: ["run", "--cwd", ".", "knowledge:mcp"] },
      },
    };

    const toml = formatCodexConfigToml(
      buildCodexCliConfig(providers, models, globalConfig, mcp, "AGENTS.md", "D:/repo"),
    );

    expect(toml).toContain("[mcp_servers.docs]");
    expect(toml).toContain("[mcp_servers.rie]");
  });
});

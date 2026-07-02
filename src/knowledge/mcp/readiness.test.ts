import { describe, expect, test } from "bun:test";
import { createMcpFixtureRepo } from "./fixtures.test.ts";
import { buildRieMcpReadinessReport } from "./readiness.ts";

describe("RIE MCP readiness", () => {
  test("reports present status for valid enabled rie server", async () => {
    const repoRoot = await createMcpFixtureRepo();
    const report = await buildRieMcpReadinessReport({
      codexHome: ".codex-test",
      repoRoot,
      mcpConfig: { servers: { rie: { transport: "stdio", command: "bun", args: ["run", "knowledge:mcp"] } } },
    });

    expect(report.injectionStatus).toBe("present");
    expect(report.serverStartup).toBe("ready");
    expect(report.capabilityCount).toBeGreaterThanOrEqual(8);
    expect(report.safe).toBe(true);
  });

  test("reports missing, disabled, and conflict states", async () => {
    const repoRoot = await createMcpFixtureRepo();
    const missing = await buildRieMcpReadinessReport({ codexHome: ".codex-test", repoRoot, mcpConfig: {} });
    const disabled = await buildRieMcpReadinessReport({
      codexHome: ".codex-test",
      repoRoot,
      mcpConfig: { servers: { rie: { enabled: false } } },
    });
    const conflict = await buildRieMcpReadinessReport({
      codexHome: ".codex-test",
      repoRoot,
      mcpConfig: { servers: { rie: { transport: "http", url: "https://example.test/mcp" } } },
    });

    expect(missing.injectionStatus).toBe("missing");
    expect(disabled.injectionStatus).toBe("disabled");
    expect(conflict).toMatchObject({ injectionStatus: "conflict", serverStartup: "invalid-command" });
  });
});

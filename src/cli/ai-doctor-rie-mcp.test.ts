import { describe, expect, test } from "bun:test";
import { createRieMcpDoctorCheck } from "./ai-doctor-rie-mcp.ts";
import { createMcpFixtureRepo } from "../knowledge/mcp/fixtures.test.ts";

describe("ai-doctor RIE MCP readiness", () => {
  test("returns an ok doctor check for valid RIE MCP config", async () => {
    const repoRoot = await createMcpFixtureRepo();
    const check = await createRieMcpDoctorCheck({
      codexHome: ".codex-test",
      repoRoot,
      mcpConfig: { servers: { rie: { transport: "stdio", command: "bun", args: ["run", "knowledge:mcp"] } } },
    });

    expect(check.name).toBe("rie_mcp_readiness");
    expect(check.status).toBe("ok");
    expect(check.summary).toContain("RIE MCP");
  });
});

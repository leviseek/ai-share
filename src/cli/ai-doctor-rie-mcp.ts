import type { McpYaml } from "../types.ts";
import { buildRieMcpReadinessReport } from "../knowledge/mcp/readiness.ts";

type DoctorStatus = "ok" | "warning" | "error";

export type RieMcpDoctorCheck = {
  name: "rie_mcp_readiness";
  status: DoctorStatus;
  summary: string;
  elapsed_ms: number;
  details: unknown;
};

export async function createRieMcpDoctorCheck(input: {
  mcpConfig: McpYaml;
  codexHome: string;
  repoRoot: string;
}): Promise<RieMcpDoctorCheck> {
  const startedAt = performance.now();
  const report = await buildRieMcpReadinessReport(input);
  const ok = report.injectionStatus === "present" && report.serverStartup === "ready";
  const status: DoctorStatus = ok ? "ok" : report.injectionStatus === "conflict" ? "error" : "warning";
  return {
    name: "rie_mcp_readiness",
    status,
    summary: ok
      ? `RIE MCP ready: ${report.capabilityCount} capabilities, snapshot=${report.snapshotStatus}.`
      : `RIE MCP not ready: injection=${report.injectionStatus}, startup=${report.serverStartup}.`,
    elapsed_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    details: report,
  };
}

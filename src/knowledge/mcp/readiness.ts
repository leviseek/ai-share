import type { McpYaml, McpServerSource } from "../../types.ts";
import { getSnapshotStatus } from "./snapshot.ts";
import type { SnapshotStatus } from "./types.ts";

export type RieMcpInjectionStatus = "present" | "missing" | "disabled" | "conflict";
export type RieMcpServerStartup = "ready" | "invalid-command" | "invalid-env" | "unknown";

export type RieMcpReadinessReport = {
  injectionStatus: RieMcpInjectionStatus;
  targetCodexHome: string;
  serverStartup: RieMcpServerStartup;
  snapshotStatus: SnapshotStatus;
  capabilityCount: number;
  recoveryActions: string[];
  safe: boolean;
};

export type RieMcpReadinessInput = {
  mcpConfig: McpYaml;
  codexHome: string;
  repoRoot?: string;
  refresh?: boolean;
};

const RIE_CAPABILITY_COUNT = 9;

export async function buildRieMcpReadinessReport(input: RieMcpReadinessInput): Promise<RieMcpReadinessReport> {
  const server = input.mcpConfig.servers?.rie;
  const injectionStatus = injectionStatusFor(server);
  const serverStartup = serverStartupFor(server);
  const snapshot = await getSnapshotStatus({
    ...(input.repoRoot === undefined ? {} : { repoRoot: input.repoRoot }),
    ...(input.refresh === undefined ? {} : { refresh: input.refresh }),
  });
  const recoveryActions = [...recoveryForInjection(injectionStatus, serverStartup), ...snapshot.recoveryActions];
  return {
    injectionStatus,
    targetCodexHome: input.codexHome,
    serverStartup,
    snapshotStatus: snapshot.status,
    capabilityCount: injectionStatus === "present" ? RIE_CAPABILITY_COUNT : 0,
    recoveryActions,
    safe: true,
  };
}

function injectionStatusFor(server: McpServerSource | undefined): RieMcpInjectionStatus {
  if (server === undefined) return "missing";
  if (server.enabled === false) return "disabled";
  if (server.transport === "http" || server.url !== undefined) return "conflict";
  return "present";
}

function serverStartupFor(server: McpServerSource | undefined): RieMcpServerStartup {
  if (server === undefined || server.enabled === false) return "unknown";
  if (server.transport === "http" || server.url !== undefined) return "invalid-command";
  if (typeof server.command !== "string" || server.command.trim().length === 0) return "invalid-command";
  return "ready";
}

function recoveryForInjection(status: RieMcpInjectionStatus, startup: RieMcpServerStartup): string[] {
  const actions: string[] = [];
  if (status === "missing")
    actions.push("Add the shared rie MCP server definition to config/mcp.yaml and regenerate Codex config.");
  if (status === "disabled")
    actions.push("Remove the local RIE MCP opt-out or enable the rie server before generation.");
  if (status === "conflict") actions.push("Configure servers.rie as a local stdio MCP server.");
  if (startup === "invalid-command") actions.push("Check servers.rie.command and servers.rie.args in config/mcp.yaml.");
  if (startup === "invalid-env") actions.push("Check servers.rie.env placeholders in config/mcp.yaml.");
  return actions;
}

#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import type { ContextRequest } from "../context/builder.ts";
import { stdin as input, stdout as output } from "node:process";
import { resolveRepositorySelection, type RepositorySelectionInput } from "./repository.ts";
import { getSnapshotStatus, loadRepositorySnapshot } from "./snapshot.ts";
import {
  createKnowledgeMcpTools,
  createRepositoryMcpTools,
  RIE_MCP_TOOL_DEFINITIONS,
  type RepositoryMcpTools,
} from "./tools.ts";
export type { RepositorySelection, RepositorySelectionInput } from "./repository.ts";
export type { LoadedRepositorySnapshot, SnapshotInput } from "./snapshot.ts";
export type { KnowledgeMcpTools, McpToolDefinition, RepositoryMcpTools } from "./tools.ts";
export type * from "./types.ts";
export {
  createKnowledgeMcpTools,
  createRepositoryMcpTools,
  getSnapshotStatus,
  loadRepositorySnapshot,
  resolveRepositorySelection,
  RIE_MCP_TOOL_DEFINITIONS,
};

export function listRieMcpTools(): typeof RIE_MCP_TOOL_DEFINITIONS {
  return RIE_MCP_TOOL_DEFINITIONS;
}

export async function runStdioMcpServer(inputOptions: RepositorySelectionInput = {}): Promise<void> {
  const tools = createRepositoryMcpTools(inputOptions);
  const rl = createInterface({ input, output });
  for await (const line of rl) {
    if (line.trim().length === 0) continue;
    const request = parseJsonRpc(line);
    try {
      const result = await handleJsonRpc(tools, request.method, request.params);
      console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    } catch (error) {
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32000, message: error instanceof Error ? error.message : "Unknown MCP error" },
        }),
      );
    }
  }
}

type JsonRpcRequest = {
  id: unknown;
  method: string;
  params: unknown;
};

function parseJsonRpc(line: string): JsonRpcRequest {
  const parsed = JSON.parse(line) as Partial<JsonRpcRequest>;
  if (typeof parsed.method !== "string") throw new Error("JSON-RPC method is required.");
  return { id: parsed.id, method: parsed.method, params: parsed.params };
}

async function handleJsonRpc(tools: RepositoryMcpTools, method: string, params: unknown): Promise<unknown> {
  if (method === "initialize") return { protocolVersion: "2024-11-05", serverInfo: { name: "rie", version: "0.1.0" } };
  if (method === "tools/list") {
    return { tools: RIE_MCP_TOOL_DEFINITIONS.map((tool) => ({ name: tool.name, description: tool.description })) };
  }
  if (method !== "tools/call") throw new Error(`Unsupported MCP method: ${method}`);
  const call = params as { name?: string; arguments?: unknown };
  return await callTool(tools, call.name, call.arguments);
}

async function callTool(tools: RepositoryMcpTools, name: string | undefined, args: unknown): Promise<unknown> {
  const inputArgs = isRecord(args) ? args : {};
  if (name === "rie.search")
    return await tools.search({ query: requireString(inputArgs.query, "query"), ...optionalRepo(inputArgs) });
  if (name === "rie.context") return await tools.context(contextRequest(inputArgs));
  if (name === "rie.graph") return await tools.graph(inputArgs);
  if (name === "rie.neighbors")
    return await tools.neighbors({
      objectId: requireString(inputArgs.objectId, "objectId"),
      ...optionalRepo(inputArgs),
    });
  if (name === "rie.impact")
    return await tools.impact({ objectId: requireString(inputArgs.objectId, "objectId"), ...optionalRepo(inputArgs) });
  if (name === "rie.explain")
    return await tools.explain({ objectId: requireString(inputArgs.objectId, "objectId"), ...optionalRepo(inputArgs) });
  if (name === "rie.context_quality") return await tools.contextQuality(contextRequest(inputArgs));
  if (name === "rie.graph_export")
    return await tools.graphExport({ format: graphExportFormat(inputArgs.format), ...optionalRepo(inputArgs) });
  if (name === "rie.readiness") return await tools.readiness(inputArgs);
  throw new Error(`Unsupported RIE MCP tool: ${name ?? "unknown"}`);
}

function optionalRepo(args: Record<string, unknown>): { repoRoot?: string } {
  return typeof args.repoRoot === "string" ? { repoRoot: args.repoRoot } : {};
}

function contextRequest(args: Record<string, unknown>): ContextRequest & { repoRoot?: string } {
  return {
    query: requireString(args.query, "query"),
    ...intentField(args.intent),
    ...(isStringArray(args.paths) ? { paths: args.paths } : {}),
    ...(isStringArray(args.objectIds) ? { objectIds: args.objectIds } : {}),
    ...(typeof args.repoRoot === "string" ? { repoRoot: args.repoRoot } : {}),
  };
}

function intentField(value: unknown): Pick<ContextRequest, "intent"> | Record<string, never> {
  if (
    value === "plan" ||
    value === "implement" ||
    value === "debug" ||
    value === "review" ||
    value === "test" ||
    value === "explain"
  ) {
    return { intent: value };
  }
  return {};
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function graphExportFormat(value: unknown): "json" | "mermaid" {
  if (value === "json" || value === "mermaid") return value;
  return "json";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.main) await runStdioMcpServer();

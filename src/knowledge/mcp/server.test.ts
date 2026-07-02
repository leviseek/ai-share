import { describe, expect, test } from "bun:test";
import { handleJsonRpc, listRieMcpTools } from "./server.ts";
import type { RepositoryMcpTools } from "./tools.ts";

describe("RIE MCP server", () => {
  test("lists stable tool discovery names", () => {
    const names = listRieMcpTools().map((tool) => tool.name);

    expect(names).toContain("rie.search");
    expect(names).toContain("rie.context");
    expect(names).toContain("rie.graph");
    expect(names).toContain("rie.neighbors");
    expect(names).toContain("rie.impact");
    expect(names).toContain("rie.explain");
    expect(names).toContain("rie.context_quality");
    expect(names).toContain("rie.graph_export");
    expect(names.length).toBeGreaterThanOrEqual(7);
  });

  test("returns MCP initialize capabilities", async () => {
    const result = await handleJsonRpc(testTools(), "initialize", {});

    expect(result).toEqual({
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "rie", version: "0.1.0" },
    });
  });

  test("lists tools with input schemas", async () => {
    const result = await handleJsonRpc(testTools(), "tools/list", {});
    expectToolsListResult(result);
    const searchTool = result.tools.find((tool) => tool.name === "rie.search");

    expect(searchTool).toEqual({
      name: "rie.search",
      description: "Search repository knowledge objects by text query.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
          repoRoot: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    });
  });

  test("wraps tool call output as MCP content", async () => {
    const result = await handleJsonRpc(testTools(), "tools/call", {
      name: "rie.search",
      arguments: { query: "main" },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              repoRoot: "/repo",
              snapshot: snapshot(),
              results: [{ id: "file:main", score: 1, title: "main" }],
            },
            null,
            2,
          ),
        },
      ],
    });
  });
});

function testTools(): RepositoryMcpTools {
  return {
    search() {
      return Promise.resolve({
        repoRoot: "/repo",
        snapshot: snapshot(),
        results: [{ id: "file:main", score: 1, title: "main" }],
      });
    },
    graph() {
      return Promise.reject(new Error("unexpected graph call"));
    },
    neighbors() {
      return Promise.reject(new Error("unexpected neighbors call"));
    },
    context() {
      return Promise.reject(new Error("unexpected context call"));
    },
    contextQuality() {
      return Promise.reject(new Error("unexpected contextQuality call"));
    },
    impact() {
      return Promise.reject(new Error("unexpected impact call"));
    },
    explain() {
      return Promise.reject(new Error("unexpected explain call"));
    },
    graphExport() {
      return Promise.reject(new Error("unexpected graphExport call"));
    },
    readiness() {
      return Promise.reject(new Error("unexpected readiness call"));
    },
  };
}

type ToolsListResult = {
  tools: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }[];
};

function expectToolsListResult(value: unknown): asserts value is ToolsListResult {
  expect(value).toBeObject();
  if (!isRecord(value) || !Array.isArray(value.tools)) throw new Error("Expected tools/list result.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshot(): ReturnType<RepositoryMcpTools["search"]> extends Promise<infer TResult>
  ? TResult extends { snapshot: infer TSnapshot }
    ? TSnapshot
    : never
  : never {
  return {
    status: "current",
    repoRoot: "/repo",
    storeDir: "/repo/.rie",
    objectCount: 1,
    edgeCount: 0,
    diagnosticCount: 0,
    recoveryActions: [],
  };
}

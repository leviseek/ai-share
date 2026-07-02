import { describe, expect, test } from "bun:test";
import { listRieMcpTools } from "./server.ts";

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
});

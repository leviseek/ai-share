import { describe, expect, test } from "bun:test";
import { validateMcpServers } from "./mcp.ts";

describe("validateMcpServers", () => {
  test("rejects rie configured as HTTP because v1 must be local stdio", () => {
    const errors: { file: string; path: string; message: string }[] = [];
    validateMcpServers(errors, { servers: { rie: { transport: "http", url: "https://example.test/mcp" } } });

    expect(errors.map((error) => error.message)).toContain("RIE MCP server 'rie' must use stdio transport");
  });

  test("skips disabled local MCP entries", () => {
    const errors: { file: string; path: string; message: string }[] = [];
    validateMcpServers(errors, { servers: { rie: { enabled: false } } });

    expect(errors).toEqual([]);
  });

  test("redacts secret-like values in diagnostics", () => {
    const errors: { file: string; path: string; message: string }[] = [];
    validateMcpServers(errors, { servers: { tool: { command: "node", env: { TOKEN: "sk-1234567890abcdef" } } } });

    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).not.toContain("sk-1234567890abcdef");
  });
});

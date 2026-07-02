import { describe, expect, test } from "bun:test";
import { YAML_SCHEMA_SPECS } from "./schema-spec.ts";

describe("mcp.yaml schema", () => {
  test("allows enabled flag for local opt-out metadata", () => {
    const mcp = YAML_SCHEMA_SPECS.find((spec) => spec.sourceFile === "mcp.yaml");
    const servers = mcp?.root.type === "object" ? mcp.root.properties?.servers : undefined;
    const server =
      servers?.type === "object" && typeof servers.additionalProperties === "object"
        ? servers.additionalProperties
        : undefined;

    expect(server?.type).toBe("object");
    expect(server?.type === "object" ? server.properties?.enabled?.type : undefined).toBe("boolean");
  });
});

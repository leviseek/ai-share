import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { contentHash, objectId } from "../core/ids.ts";
import type {
  KnowledgeObject,
  KnowledgeRelationship,
  ParseResult,
  ParserContext,
  RepositoryParser,
  RepositoryResource,
} from "../core/types.ts";

export const yamlJsonParser: RepositoryParser = {
  name: "yaml-json",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "file" && /\.(json|ya?ml)$/.test(resource.path) && !resource.path.endsWith("package.json");
  },
  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const raw = await readFile(resource.absolutePath, "utf-8");
    const diagnostics = validateConfigSyntax(resource.path, raw);
    const id = objectId("config", resource.path);
    const object: KnowledgeObject = {
      id,
      type: "Config",
      title: resource.path.split("/").at(-1) ?? resource.path,
      summary: summarizeConfig(raw),
      tags: [resource.path.endsWith(".json") ? "json" : "yaml", "config"],
      metadata: { lineCount: raw.split(/\r?\n/).length },
      path: resource.path,
      language: resource.path.endsWith(".json") ? "json" : "yaml",
      relationships: [],
      updated_at: context.now,
      hash: resource.hash ?? contentHash(raw),
    };
    const relationships: KnowledgeRelationship[] = [];
    const parent = dirname(resource.path).replaceAll("\\", "/");
    if (parent !== ".")
      relationships.push({
        from: objectId("dir", parent),
        to: id,
        type: "contains",
        metadata: { parser: "yaml-json" },
      });
    return { objects: [object], relationships, diagnostics };
  },
};

function validateConfigSyntax(path: string, raw: string): ParseResult["diagnostics"] {
  if (!path.endsWith(".json")) return [];
  try {
    JSON.parse(raw);
    return [];
  } catch (error) {
    return [
      {
        parser: "yaml-json",
        path,
        severity: "error",
        message: error instanceof Error ? error.message : "JSON parse failed.",
      },
    ];
  }
}

function summarizeConfig(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => redactSecretLine(line.trim()))
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .slice(0, 3)
    .join(" / ");
}

function redactSecretLine(line: string): string {
  if (/(api[_-]?key|token|cookie|password|secret)/i.test(line)) return line.replace(/(:|=).+$/, "$1 <redacted>");
  return line;
}

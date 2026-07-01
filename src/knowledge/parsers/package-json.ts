import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJsonHash, contentHash, objectId } from "../core/ids.ts";
import type {
  KnowledgeObject,
  KnowledgeRelationship,
  ParseResult,
  ParserContext,
  RepositoryParser,
  RepositoryResource,
} from "../core/types.ts";

export const packageJsonParser: RepositoryParser = {
  name: "package-json",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "file" && resource.path.endsWith("package.json");
  },
  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const raw = await readFile(resource.absolutePath, "utf-8");
    const parsed = JSON.parse(raw) as PackageJson;
    const packageName = typeof parsed.name === "string" ? parsed.name : resource.path;
    const packageId = `package:${packageName}`;
    const objects: KnowledgeObject[] = [
      {
        id: packageId,
        type: "Package",
        title: packageName,
        tags: ["package", "json"],
        metadata: { version: parsed.version, private: parsed.private === true },
        path: resource.path,
        language: "json",
        relationships: [],
        updated_at: context.now,
        hash: resource.hash ?? contentHash(raw),
      },
    ];
    const relationships: KnowledgeRelationship[] = [];
    const parent = dirname(resource.path).replaceAll("\\", "/");
    if (parent !== ".")
      relationships.push({
        from: objectId("dir", parent),
        to: packageId,
        type: "contains",
        metadata: { parser: "package-json" },
      });
    for (const [name, command] of Object.entries(parsed.scripts ?? {})) {
      const scriptId = `script:${packageName}#${name}`;
      objects.push({
        id: scriptId,
        type: "Script",
        title: name,
        summary: command,
        tags: ["script"],
        metadata: { command },
        path: resource.path,
        language: "json",
        relationships: [],
        updated_at: context.now,
        hash: canonicalJsonHash({ name, command }),
      });
      relationships.push({ from: packageId, to: scriptId, type: "contains", metadata: { parser: "package-json" } });
    }
    for (const dependency of Object.keys({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) })) {
      relationships.push({
        from: packageId,
        to: `package:${dependency}`,
        type: "depends_on",
        metadata: { parser: "package-json" },
      });
    }
    return { objects, relationships, diagnostics: [] };
  },
};

type PackageJson = {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

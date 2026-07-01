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

export const genericFileParser: RepositoryParser = {
  name: "generic-file",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "file" && resource.language === undefined;
  },
  parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const id = objectId("file", resource.path);
    const object: KnowledgeObject = {
      id,
      type: "File",
      title: resource.path.split("/").at(-1) ?? resource.path,
      tags: ["file", "unknown-language"],
      metadata: { size: resource.size ?? 0 },
      path: resource.path,
      relationships: [],
      updated_at: context.now,
      hash: resource.hash ?? contentHash(resource.path),
    };
    const relationships: KnowledgeRelationship[] = [];
    const parent = dirname(resource.path).replaceAll("\\", "/");
    if (parent !== ".")
      relationships.push({
        from: objectId("dir", parent),
        to: id,
        type: "contains",
        metadata: { parser: "generic-file" },
      });
    return Promise.resolve({ objects: [object], relationships, diagnostics: [] });
  },
};

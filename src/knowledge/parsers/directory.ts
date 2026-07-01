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

export const directoryParser: RepositoryParser = {
  name: "directory",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "directory";
  },
  parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const id = objectId("dir", resource.path);
    const object: KnowledgeObject = {
      id,
      type: "Directory",
      title: resource.path.split("/").at(-1) ?? resource.path,
      tags: ["directory"],
      metadata: {},
      path: resource.path,
      relationships: [],
      updated_at: context.now,
      hash: contentHash(resource.path),
    };
    const relationships: KnowledgeRelationship[] = [];
    const parent = dirname(resource.path).replaceAll("\\", "/");
    if (parent !== ".")
      relationships.push({
        from: objectId("dir", parent),
        to: id,
        type: "contains",
        metadata: { parser: "directory" },
      });
    return Promise.resolve({ objects: [object], relationships, diagnostics: [] });
  },
};

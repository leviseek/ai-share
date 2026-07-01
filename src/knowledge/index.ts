import { basename, resolve } from "node:path";
import { canonicalJsonHash, contentHash } from "./core/ids.ts";
import { buildGraph } from "./graph/builder.ts";
import { directoryParser } from "./parsers/directory.ts";
import { genericFileParser } from "./parsers/generic-file.ts";
import { markdownParser } from "./parsers/markdown.ts";
import { packageJsonParser } from "./parsers/package-json.ts";
import { ParserRegistry } from "./parsers/registry.ts";
import { typescriptParser } from "./parsers/typescript.ts";
import { yamlJsonParser } from "./parsers/yaml-json.ts";
import { scanRepository, type ScanOptions } from "./repository/scanner.ts";
import type { BuildResult, KnowledgeObject, ParserContext } from "./core/types.ts";

const KNOWLEDGE_SCHEMA_VERSION = 1;

export type BuildKnowledgeOptions = {
  repoRoot: string;
  includeHidden?: boolean;
  ignores?: string[];
  maxFileBytes?: number;
};

export async function buildKnowledge(options: BuildKnowledgeOptions): Promise<BuildResult> {
  const repoRoot = resolve(options.repoRoot);
  const scanOptions: ScanOptions = { repoRoot };
  if (options.includeHidden !== undefined) scanOptions.includeHidden = options.includeHidden;
  if (options.ignores !== undefined) scanOptions.ignores = options.ignores;
  if (options.maxFileBytes !== undefined) scanOptions.maxFileBytes = options.maxFileBytes;
  const scan = await scanRepository(scanOptions);
  const registry = new ParserRegistry([
    directoryParser,
    markdownParser,
    packageJsonParser,
    yamlJsonParser,
    typescriptParser,
    genericFileParser,
  ]);
  const now = new Date().toISOString();
  const context: ParserContext = {
    repoRoot,
    now,
    repositoryFiles: new Set(
      scan.resources.filter((resource) => resource.kind === "file").map((resource) => resource.path),
    ),
  };
  const results = await Promise.all(scan.resources.map((resource) => registry.parse(resource, context)));
  const objects = [projectObject(repoRoot, now, scan.resources.length), ...results.flatMap((result) => result.objects)];
  const relationships = results.flatMap((result) => result.relationships);
  for (const object of objects)
    object.relationships = relationships.filter((relationship) => relationship.from === object.id);
  const graph = buildGraph(objects, relationships);
  const diagnostics = [...scan.diagnostics, ...results.flatMap((result) => result.diagnostics)];
  const buildHash = canonicalJsonHash({
    objects: objects.map((object) => object.hash),
    edges: graph.edges.map((edge) => edge.id),
  });
  return {
    objects,
    nodes: graph.nodes,
    edges: graph.edges,
    diagnostics,
    metadata: {
      schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
      repoRoot,
      builtAt: now,
      buildHash,
      resourceCount: scan.resources.length,
    },
  };
}

function projectObject(repoRoot: string, now: string, resourceCount: number): KnowledgeObject {
  return {
    id: "project:root",
    type: "Project",
    title: basename(repoRoot) || repoRoot,
    summary: `Repository knowledge snapshot for ${repoRoot}`,
    tags: ["project"],
    metadata: { repoRoot, resourceCount, schemaVersion: KNOWLEDGE_SCHEMA_VERSION },
    relationships: [],
    updated_at: now,
    hash: contentHash(`${repoRoot}:${resourceCount}`),
  };
}

import { ParserRegistry } from "./parsers/registry.ts";
import { directoryParser } from "./parsers/directory.ts";
import { markdownParser } from "./parsers/markdown.ts";
import { packageJsonParser } from "./parsers/package-json.ts";
import { typescriptParser } from "./parsers/typescript.ts";
import { yamlJsonParser } from "./parsers/yaml-json.ts";
import { scanRepository } from "./repository/scanner.ts";
import { buildGraph } from "./graph/builder.ts";
import type { BuildResult, ParserContext } from "./core/types.ts";

export type BuildKnowledgeOptions = {
  repoRoot: string;
};

export async function buildKnowledge(options: BuildKnowledgeOptions): Promise<BuildResult> {
  const resources = await scanRepository({ repoRoot: options.repoRoot });
  const registry = new ParserRegistry([
    directoryParser,
    markdownParser,
    packageJsonParser,
    yamlJsonParser,
    typescriptParser,
  ]);
  const context: ParserContext = { repoRoot: options.repoRoot, now: new Date().toISOString() };
  const results = await Promise.all(resources.map((resource) => registry.parse(resource, context)));
  const objects = results.flatMap((result) => result.objects);
  const relationships = results.flatMap((result) => result.relationships);
  for (const object of objects)
    object.relationships = relationships.filter((relationship) => relationship.from === object.id);
  const graph = buildGraph(objects, relationships);
  return {
    objects,
    nodes: graph.nodes,
    edges: graph.edges,
    diagnostics: results.flatMap((result) => result.diagnostics),
  };
}

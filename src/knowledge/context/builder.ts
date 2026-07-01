import type { BuildResult, GraphSubgraph, KnowledgeObject } from "../core/types.ts";
import { subgraph } from "../graph/builder.ts";

export type ContextRequest = {
  query: string;
  intent?: "implement" | "debug" | "review" | "explain" | "plan" | "test";
  paths?: string[];
  objectIds?: string[];
  budget?: { maxObjects: number };
};

export type ContextSection = {
  title: string;
  objectIds: string[];
};

export type BuiltContext = {
  summary: string;
  objects: KnowledgeObject[];
  graph: GraphSubgraph;
  sections: ContextSection[];
  diagnostics: string[];
};

export function buildContext(
  result: Pick<BuildResult, "objects" | "nodes" | "edges">,
  request: ContextRequest,
): BuiltContext {
  const intent = request.intent ?? inferIntent(request.query);
  const seeds = selectSeeds(result.objects, request);
  const graph = subgraph(
    { nodes: result.nodes, edges: result.edges },
    seeds,
    intent === "explain" ? 1 : 2,
    relationshipProfile(intent),
  );
  const ids = new Set(graph.nodes.map((node) => node.objectId));
  const maxObjects = request.budget?.maxObjects ?? 30;
  const objects = result.objects.filter((object) => ids.has(object.id)).slice(0, maxObjects);
  return {
    summary: `RIE context intent=${intent}, seeds=${seeds.length}, objects=${objects.length}`,
    objects,
    graph: {
      nodes: graph.nodes.filter((node) => objects.some((object) => object.id === node.objectId)),
      edges: graph.edges,
    },
    sections: groupSections(objects),
    diagnostics: seeds.length === 0 ? ["未找到明确 seed，已返回空上下文。"] : [],
  };
}

function inferIntent(query: string): NonNullable<ContextRequest["intent"]> {
  const lower = query.toLowerCase();
  if (/(debug|错误|失败|修复|bug)/.test(lower)) return "debug";
  if (/(review|审查|检查)/.test(lower)) return "review";
  if (/(test|测试)/.test(lower)) return "test";
  if (/(explain|解释|说明)/.test(lower)) return "explain";
  if (/(plan|设计|架构|规划)/.test(lower)) return "plan";
  return "implement";
}

function selectSeeds(objects: KnowledgeObject[], request: ContextRequest): string[] {
  const explicit = request.objectIds ?? [];
  const pathSeeds = new Set(request.paths ?? []);
  const queryTerms = request.query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
  const matched = objects
    .filter(
      (object) =>
        explicit.includes(object.id) ||
        (object.path !== undefined && pathSeeds.has(object.path)) ||
        matchesTerms(object, queryTerms),
    )
    .slice(0, 12)
    .map((object) => object.id);
  return [...new Set([...explicit, ...matched])];
}

function matchesTerms(object: KnowledgeObject, terms: string[]): boolean {
  const haystack =
    `${object.id} ${object.title} ${object.summary ?? ""} ${object.path ?? ""} ${object.tags.join(" ")}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function relationshipProfile(intent: NonNullable<ContextRequest["intent"]>): Parameters<typeof subgraph>[3] {
  if (intent === "debug") return ["calls", "imports", "depends_on", "references", "tested_by", "contains"];
  if (intent === "review") return ["contains", "generated_from", "generates", "references", "documents"];
  if (intent === "plan") return ["contains", "references", "supports", "requires", "documents", "related_to"];
  if (intent === "test") return ["tested_by", "imports", "depends_on", "contains"];
  return ["contains", "implements", "depends_on", "imports", "configures", "tested_by", "references"];
}

function groupSections(objects: KnowledgeObject[]): ContextSection[] {
  const rules = objects
    .filter((object) => object.type === "Rule" || object.type === "Agent")
    .map((object) => object.id);
  const docs = objects
    .filter((object) => ["Document", "Spec", "Workflow", "Prompt", "Example"].includes(object.type))
    .map((object) => object.id);
  const code = objects
    .filter((object) => ["CodeFile", "CodeSymbol", "Test"].includes(object.type))
    .map((object) => object.id);
  return [
    { title: "Rules", objectIds: rules },
    { title: "Docs", objectIds: docs },
    { title: "Code", objectIds: code },
  ].filter((section) => section.objectIds.length > 0);
}

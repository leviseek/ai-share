import type { BuildResult, GraphEdge, GraphSubgraph, KnowledgeObject, KnowledgeObjectType } from "../core/types.ts";
import { rankByTextSimilarity } from "../embedding/ranking.ts";
import type { BuiltContext, ContextRequest } from "./builder.ts";

export type ContextQualityGrade = "excellent" | "good" | "weak" | "poor";

export type ContextQualityRecommendationAction =
  | "add_query_terms"
  | "add_paths"
  | "add_object_ids"
  | "increase_budget"
  | "switch_intent"
  | "inspect_impact"
  | "broaden_graph";

export type ContextQualityRecommendation = {
  action: ContextQualityRecommendationAction;
  title: string;
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type ContextQualityMetrics = {
  searchHits: number;
  seedCount: number;
  seedCoverage: number;
  objectCount: number;
  budgetUsage: number;
  typeCoverage: number;
  graphConnectivity: number;
  diagnosticsCount: number;
  relevantPathCount: number;
};

export type ContextQualityGap = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export type ContextQualityReport = {
  score: number;
  grade: ContextQualityGrade;
  metrics: ContextQualityMetrics;
  gaps: ContextQualityGap[];
  recommendations: ContextQualityRecommendation[];
};

const IMPORTANT_TYPES = new Set<KnowledgeObjectType>(["Rule", "Agent", "Document", "Spec", "CodeFile", "CodeSymbol"]);

export function evaluateContextQuality(
  result: Pick<BuildResult, "objects" | "nodes" | "edges">,
  request: ContextRequest,
  context: Omit<BuiltContext, "quality">,
  seeds: string[],
): ContextQualityReport {
  const maxObjects = request.budget?.maxObjects ?? 30;
  const searchHits = rankByTextSimilarity(result.objects, request.query).length;
  const seedCoverage =
    seeds.length === 0 ? 0 : context.objects.filter((object) => seeds.includes(object.id)).length / seeds.length;
  const budgetUsage = maxObjects === 0 ? 0 : context.objects.length / maxObjects;
  const typeCoverage = calculateTypeCoverage(context.objects);
  const graphConnectivity = calculateGraphConnectivity(context.graph);
  const relevantPathCount = new Set(context.objects.map((object) => object.path).filter((path) => path !== undefined))
    .size;
  const metrics: ContextQualityMetrics = {
    searchHits,
    seedCount: seeds.length,
    seedCoverage: round(seedCoverage),
    objectCount: context.objects.length,
    budgetUsage: round(budgetUsage),
    typeCoverage: round(typeCoverage),
    graphConnectivity: round(graphConnectivity),
    diagnosticsCount: context.diagnostics.length,
    relevantPathCount,
  };
  const gaps = buildGaps(metrics);
  const score = calculateScore(metrics, gaps);
  return {
    score,
    grade: gradeScore(score),
    metrics,
    gaps,
    recommendations: buildRecommendations(metrics, request),
  };
}

function calculateTypeCoverage(objects: KnowledgeObject[]): number {
  if (objects.length === 0) return 0;
  const types = new Set(objects.map((object) => object.type));
  const covered = [...IMPORTANT_TYPES].filter((type) => types.has(type)).length;
  return covered / IMPORTANT_TYPES.size;
}

function calculateGraphConnectivity(graph: GraphSubgraph): number {
  if (graph.nodes.length <= 1) return graph.nodes.length;
  const connectedNodeIds = new Set(graph.edges.flatMap((edge: GraphEdge) => [edge.from, edge.to]));
  return graph.nodes.filter((node) => connectedNodeIds.has(node.id)).length / graph.nodes.length;
}

function buildGaps(metrics: ContextQualityMetrics): ContextQualityGap[] {
  const gaps: ContextQualityGap[] = [];
  if (metrics.searchHits === 0)
    gaps.push({
      code: "no_search_hits",
      severity: "critical",
      message: "Query did not match indexed knowledge objects.",
    });
  if (metrics.seedCount === 0)
    gaps.push({ code: "no_seeds", severity: "critical", message: "Context has no explicit or inferred seed objects." });
  if (metrics.objectCount === 0)
    gaps.push({ code: "empty_context", severity: "critical", message: "Context contains no knowledge objects." });
  if (metrics.typeCoverage < 0.34)
    gaps.push({
      code: "low_type_coverage",
      severity: "warning",
      message: "Context covers too few knowledge object types.",
    });
  if (metrics.graphConnectivity < 0.5 && metrics.objectCount > 1)
    gaps.push({
      code: "weak_graph_connectivity",
      severity: "warning",
      message: "Selected objects are weakly connected in the graph.",
    });
  if (metrics.budgetUsage >= 1)
    gaps.push({
      code: "budget_saturated",
      severity: "warning",
      message: "Context reached the object budget and may be truncated.",
    });
  if (metrics.diagnosticsCount > 0)
    gaps.push({ code: "context_diagnostics", severity: "warning", message: "Context builder reported diagnostics." });
  return gaps;
}

function calculateScore(metrics: ContextQualityMetrics, gaps: ContextQualityGap[]): number {
  const positive =
    20 * Math.min(metrics.searchHits / 5, 1) +
    20 * metrics.seedCoverage +
    20 * Math.min(metrics.objectCount / 8, 1) +
    15 * metrics.typeCoverage +
    15 * metrics.graphConnectivity +
    10 * Math.min(metrics.relevantPathCount / 3, 1);
  const penalties = gaps.reduce(
    (total, gap) => total + (gap.severity === "critical" ? 18 : gap.severity === "warning" ? 8 : 2),
    0,
  );
  return Math.max(0, Math.min(100, Math.round(positive - penalties)));
}

function gradeScore(score: number): ContextQualityGrade {
  if (score >= 85) return "excellent";
  if (score >= 65) return "good";
  if (score >= 35) return "weak";
  return "poor";
}

function buildRecommendations(metrics: ContextQualityMetrics, request: ContextRequest): ContextQualityRecommendation[] {
  const recommendations: ContextQualityRecommendation[] = [];
  if (metrics.searchHits === 0)
    recommendations.push({
      action: "add_query_terms",
      title: "Use repository-specific query terms",
      reason: "No indexed object matched the current query.",
      confidence: "high",
    });
  if (metrics.seedCount === 0)
    recommendations.push({
      action: "add_object_ids",
      title: "Add explicit objectIds or paths",
      reason: "Explicit seeds make context assembly more deterministic.",
      confidence: "high",
    });
  if ((request.paths?.length ?? 0) === 0 && metrics.relevantPathCount === 0)
    recommendations.push({
      action: "add_paths",
      title: "Provide relevant paths",
      reason: "Path hints can anchor the context to concrete files.",
      confidence: "medium",
    });
  if (metrics.budgetUsage >= 1)
    recommendations.push({
      action: "increase_budget",
      title: "Increase maxObjects",
      reason: "The current context may be truncated by the object budget.",
      confidence: "medium",
    });
  if (metrics.typeCoverage < 0.34)
    recommendations.push({
      action: "switch_intent",
      title: "Review the selected intent",
      reason: "Different intents prioritize different relationship profiles.",
      confidence: "low",
    });
  if (metrics.graphConnectivity < 0.5 && metrics.objectCount > 1)
    recommendations.push({
      action: "broaden_graph",
      title: "Broaden graph exploration",
      reason: "Weakly connected context may miss related implementation or tests.",
      confidence: "medium",
    });
  if (metrics.objectCount > 0)
    recommendations.push({
      action: "inspect_impact",
      title: "Inspect impact before editing",
      reason: "Impact analysis can reveal dependent files and tests.",
      confidence: "medium",
    });
  return recommendations;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

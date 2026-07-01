import { describe, expect, test } from "bun:test";
import type { GraphEdge, GraphNode, KnowledgeObject } from "../core/types.ts";
import {
  buildCodexMockTrace,
  buildDashboardMetrics,
  buildRepositoryTree,
  buildStudioContext,
  type StudioSnapshot,
} from "./data.ts";

const now = "2026-07-01T00:00:00.000Z";

describe("Repository Intelligence Studio data", () => {
  test("builds a repository tree from object paths", () => {
    const tree = buildRepositoryTree([
      object("dir:src", "Directory", "src", "src"),
      object("codefile:src/main.ts", "CodeFile", "main.ts", "src/main.ts"),
      object("code:src/main.ts#function:main", "CodeSymbol", "main", "src/main.ts"),
    ]);
    expect(tree.children[0]?.name).toBe("src");
    expect(tree.children[0]?.children[0]?.name).toBe("main.ts");
    expect(tree.children[0]?.children[0]?.objectIds).toContain("codefile:src/main.ts");
  });

  test("calculates dashboard health metrics", () => {
    const snapshot = fixtureSnapshot();
    const context = buildStudioContext(snapshot, { query: "main", objectIds: ["codefile:src/main.ts"] });
    const metrics = buildDashboardMetrics(snapshot, context);
    expect(metrics.objects).toBe(3);
    expect(metrics.nodes).toBe(3);
    expect(metrics.edges).toBe(2);
    expect(metrics.orphanNodes).toBe(1);
    expect(metrics.brokenEdges).toBe(0);
    expect(metrics.objectTypes.CodeFile).toBe(2);
    expect(metrics.contextCoverage).toBeGreaterThan(0);
  });

  test("builds observable Codex mock trace", () => {
    const trace = buildCodexMockTrace(fixtureSnapshot(), "请设计 main 的修改方案");
    expect(trace.intent).toBe("plan");
    expect(trace.steps.map((step) => step.name)).toEqual([
      "infer_intent",
      "search",
      "context",
      "impact",
      "answer_outline",
    ]);
    expect(trace.answerOutline.length).toBeGreaterThan(0);
  });
});

function fixtureSnapshot(): StudioSnapshot {
  const objects = [
    object("dir:src", "Directory", "src", "src"),
    object("codefile:src/main.ts", "CodeFile", "main.ts", "src/main.ts"),
    object("codefile:src/orphan.ts", "CodeFile", "orphan.ts", "src/orphan.ts"),
  ];
  const nodes: GraphNode[] = objects.map((item) => {
    const node: GraphNode = {
      id: item.id,
      objectId: item.id,
      type: item.type,
      label: item.title,
      metadata: {},
    };
    if (item.path !== undefined) return { ...node, path: item.path };
    return node;
  });
  const edges: GraphEdge[] = [
    { id: "edge:1", from: "dir:src", to: "codefile:src/main.ts", type: "contains", metadata: {} },
    { id: "edge:2", from: "codefile:src/main.ts", to: "module:./util", type: "imports", metadata: {} },
  ];
  return { objects, nodes, edges };
}

function object(id: string, type: KnowledgeObject["type"], title: string, path: string): KnowledgeObject {
  return {
    id,
    type,
    title,
    tags: [],
    metadata: {},
    path,
    relationships: [],
    updated_at: now,
    hash: id,
  };
}

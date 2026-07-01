import { resolve } from "node:path";
import { buildContext } from "./context/builder.ts";
import { buildKnowledge } from "./index.ts";
import { neighbors, shortestPath, subgraph } from "./graph/builder.ts";
import { exportGraph } from "./graph/export.ts";
import { impactAnalysis } from "./graph/impact.ts";
import { buildStats, createJsonlKnowledgeStore, readBuildResult, writeBuildResult } from "./storage/jsonl-store.ts";
import { rankByTextSimilarity } from "./embedding/ranking.ts";
import type { BuildResult } from "./core/types.ts";

const DEFAULT_STORE_DIR = ".rie";

async function main(argv: string[]): Promise<void> {
  const command = argv[2] ?? "help";
  const repoRoot = process.cwd();
  const store = createJsonlKnowledgeStore(resolve(repoRoot, DEFAULT_STORE_DIR));

  if (command === "build") {
    const result = await buildKnowledge({ repoRoot });
    await writeBuildResult(store, result);
    console.log(
      `RIE build 完成：objects=${result.objects.length}, edges=${result.edges.length}, store=${DEFAULT_STORE_DIR}`,
    );
    return;
  }

  if (command === "stats") {
    const result = await loadOrBuild(repoRoot);
    console.log(JSON.stringify(buildStats({ ...result, diagnostics: [] }), null, 2));
    return;
  }

  if (command === "search") {
    const query = argv.slice(3).join(" ");
    requireQuery(query);
    const result = await loadOrBuild(repoRoot);
    const matches = rankByTextSimilarity(result.objects, query).slice(0, 10);
    for (const match of matches)
      console.log(`${match.score}\t${match.object.id}\t${match.object.path ?? ""}\t${match.object.title}`);
    return;
  }

  if (command === "context") {
    const query = argv.slice(3).join(" ");
    requireQuery(query);
    const result = await loadOrBuild(repoRoot);
    console.log(JSON.stringify(buildContext(result, { query, budget: { maxObjects: 30 } }), null, 2));
    return;
  }

  if (command === "graph") {
    const objectId = argv[3];
    const result = await loadOrBuild(repoRoot);
    const graph = { nodes: result.nodes, edges: result.edges };
    const output = objectId === undefined ? graph : subgraph(graph, [objectId], 2);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (command === "neighbors") {
    const objectId = requireObjectId(argv[3]);
    const result = await loadOrBuild(repoRoot);
    console.log(JSON.stringify(neighbors({ nodes: result.nodes, edges: result.edges }, objectId), null, 2));
    return;
  }

  if (command === "path") {
    const from = requireObjectId(argv[3]);
    const to = requireObjectId(argv[4]);
    const result = await loadOrBuild(repoRoot);
    console.log(JSON.stringify(shortestPath({ nodes: result.nodes, edges: result.edges }, from, to), null, 2));
    return;
  }

  if (command === "impact") {
    const objectId = requireObjectId(argv[3]);
    const result = await loadOrBuild(repoRoot);
    console.log(JSON.stringify(impactAnalysis({ nodes: result.nodes, edges: result.edges }, objectId), null, 2));
    return;
  }

  if (command === "export") {
    const format = argv.includes("--mermaid") ? "mermaid" : "json";
    const result = await loadOrBuild(repoRoot);
    console.log(exportGraph({ nodes: result.nodes, edges: result.edges }, format));
    return;
  }

  if (command === "doctor") {
    const result = await loadOrBuild(repoRoot);
    const nodeIds = new Set(result.nodes.map((node) => node.id));
    const missingTargets = result.edges.filter((edge) => !nodeIds.has(edge.to));
    const externalTargets = missingTargets.filter((edge) => isExternalReference(edge.to));
    const brokenEdges = missingTargets.filter((edge) => !isExternalReference(edge.to));
    console.log(
      JSON.stringify(
        {
          ok: brokenEdges.length === 0,
          brokenEdges: brokenEdges.length,
          externalReferences: externalTargets.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  printHelp();
}

async function loadOrBuild(repoRoot: string): Promise<Pick<BuildResult, "objects" | "nodes" | "edges">> {
  const store = createJsonlKnowledgeStore(resolve(repoRoot, DEFAULT_STORE_DIR));
  try {
    return await readBuildResult(store);
  } catch {
    const result = await buildKnowledge({ repoRoot });
    await writeBuildResult(store, result);
    return result;
  }
}

function requireQuery(query: string): void {
  if (query.trim().length === 0) throw new Error("请提供查询文本。");
}

function requireObjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) throw new Error("请提供 objectId。");
  return value;
}

function isExternalReference(id: string): boolean {
  return id.startsWith("module:") || id.startsWith("package:");
}

function printHelp(): void {
  console.log(
    `Knowledge CLI\n\n命令：\n  knowledge build\n  knowledge search <query>\n  knowledge graph [objectId]\n  knowledge context <query>\n  knowledge impact <objectId>\n  knowledge stats\n  knowledge doctor\n  knowledge export [--mermaid]`,
  );
}

await main(process.argv);

import { resolve } from "node:path";
import { buildContext } from "./context/builder.ts";
import type { BuildResult, GraphEdge } from "./core/types.ts";
import { rankByTextSimilarity } from "./embedding/ranking.ts";
import { exportGraph } from "./graph/export.ts";
import { impactAnalysis } from "./graph/impact.ts";
import { neighbors, shortestPath, subgraph } from "./graph/builder.ts";
import { buildKnowledge } from "./index.ts";
import { buildStats, createJsonlKnowledgeStore, readBuildResult, writeBuildResult } from "./storage/jsonl-store.ts";

const DEFAULT_STORE_DIR = ".rie";

async function main(argv: string[]): Promise<void> {
  const command = argv[2] ?? "help";
  const options = parseOptions(argv.slice(3));
  const repoRoot = resolve(options.repo ?? process.cwd());
  const storeDir = resolve(repoRoot, options.store ?? DEFAULT_STORE_DIR);
  const store = createJsonlKnowledgeStore(storeDir);

  if (command === "build") {
    const result = await buildKnowledge(buildOptions(repoRoot, options));
    await writeBuildResult(store, result);
    const summary = {
      objects: result.objects.length,
      edges: result.edges.length,
      diagnostics: result.diagnostics.length,
      store: storeDir,
      buildHash: result.metadata.buildHash,
    };
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else
      console.log(
        `RIE build complete: objects=${summary.objects}, edges=${summary.edges}, diagnostics=${summary.diagnostics}, store=${storeDir}`,
      );
    return;
  }

  if (command === "stats") {
    const result = await loadOrBuild(repoRoot, storeDir, options);
    console.log(JSON.stringify(buildStats(result), null, 2));
    return;
  }

  if (command === "search") {
    const query = positional(options).join(" ");
    requireQuery(query);
    const result = await loadOrBuild(repoRoot, storeDir, options);
    const matches = rankByTextSimilarity(result.objects, query).slice(0, 10);
    if (options.json) console.log(JSON.stringify(matches, null, 2));
    else
      for (const match of matches)
        console.log(`${match.score}\t${match.object.id}\t${match.object.path ?? ""}\t${match.object.title}`);
    return;
  }

  if (command === "context") {
    const query = positional(options).join(" ");
    requireQuery(query);
    const result = await loadOrBuild(repoRoot, storeDir, options);
    console.log(JSON.stringify(buildContext(result, { query, budget: { maxObjects: 30 } }), null, 2));
    return;
  }

  if (command === "graph") {
    const objectId = positional(options)[0];
    const result = await loadOrBuild(repoRoot, storeDir, options);
    const graph = { nodes: result.nodes, edges: result.edges };
    const output = objectId === undefined ? graph : subgraph(graph, [objectId], 2);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (command === "neighbors") {
    const objectId = requireObjectId(positional(options)[0]);
    const result = await loadOrBuild(repoRoot, storeDir, options);
    console.log(JSON.stringify(neighbors({ nodes: result.nodes, edges: result.edges }, objectId), null, 2));
    return;
  }

  if (command === "path") {
    const args = positional(options);
    const from = requireObjectId(args[0]);
    const to = requireObjectId(args[1]);
    const result = await loadOrBuild(repoRoot, storeDir, options);
    console.log(JSON.stringify(shortestPath({ nodes: result.nodes, edges: result.edges }, from, to), null, 2));
    return;
  }

  if (command === "impact") {
    const objectId = requireObjectId(positional(options)[0]);
    const result = await loadOrBuild(repoRoot, storeDir, options);
    console.log(JSON.stringify(impactAnalysis({ nodes: result.nodes, edges: result.edges }, objectId), null, 2));
    return;
  }

  if (command === "export") {
    const format = options.mermaid ? "mermaid" : "json";
    const result = await loadOrBuild(repoRoot, storeDir, options);
    console.log(exportGraph({ nodes: result.nodes, edges: result.edges }, format));
    return;
  }

  if (command === "doctor") {
    const result = await loadOrBuild(repoRoot, storeDir, options);
    const report = buildDoctorReport(result);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHelp();
}

type CliOptions = {
  repo?: string;
  store?: string;
  includeHidden?: boolean;
  ignore: string[];
  maxFileBytes?: number;
  json?: boolean;
  mermaid?: boolean;
  _: string[];
};

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = { ignore: [], _: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--repo") options.repo = requireOptionValue(args[++index], "--repo");
    else if (arg === "--store") options.store = requireOptionValue(args[++index], "--store");
    else if (arg === "--ignore") options.ignore.push(requireOptionValue(args[++index], "--ignore"));
    else if (arg === "--max-file-bytes")
      options.maxFileBytes = requirePositiveInteger(args[++index], "--max-file-bytes");
    else if (arg === "--include-hidden") options.includeHidden = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--mermaid") options.mermaid = true;
    else options._.push(arg);
  }
  return options;
}

function requireOptionValue(value: string | undefined, option: string): string {
  if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function requirePositiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(requireOptionValue(value, option));
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer.`);
  return parsed;
}

function positional(options: CliOptions): string[] {
  return options._;
}

function buildOptions(repoRoot: string, options: CliOptions): Parameters<typeof buildKnowledge>[0] {
  const buildOptions: Parameters<typeof buildKnowledge>[0] = { repoRoot };
  if (options.includeHidden !== undefined) buildOptions.includeHidden = options.includeHidden;
  if (options.ignore.length > 0) buildOptions.ignores = options.ignore;
  if (options.maxFileBytes !== undefined) buildOptions.maxFileBytes = options.maxFileBytes;
  return buildOptions;
}

async function loadOrBuild(repoRoot: string, storeDir: string, options: CliOptions): Promise<BuildResult> {
  const store = createJsonlKnowledgeStore(storeDir);
  try {
    return await readBuildResult(store);
  } catch {
    const result = await buildKnowledge(buildOptions(repoRoot, options));
    await writeBuildResult(store, result);
    return result;
  }
}

function buildDoctorReport(result: BuildResult): Record<string, unknown> {
  const nodeIds = new Set(result.nodes.map((node) => node.id));
  const missingTargets = result.edges.filter((edge) => !nodeIds.has(edge.to));
  const externalTargets = missingTargets.filter((edge) => isExternalReference(edge.to));
  const brokenEdges = missingTargets.filter((edge) => !isExternalReference(edge.to));
  const severity = result.diagnostics.reduce<Record<string, number>>((counts, diagnostic) => {
    counts[diagnostic.severity] = (counts[diagnostic.severity] ?? 0) + 1;
    return counts;
  }, {});
  return {
    ok: brokenEdges.length === 0 && (severity.error ?? 0) === 0,
    schemaVersion: result.metadata.schemaVersion,
    buildHash: result.metadata.buildHash,
    brokenEdges: brokenEdges.length,
    externalReferences: externalTargets.length,
    diagnostics: result.diagnostics.length,
    diagnosticSeverity: severity,
    sampleBrokenEdges: brokenEdges.slice(0, 10).map(edgeSummary),
  };
}

function edgeSummary(edge: GraphEdge): Record<string, unknown> {
  return { from: edge.from, to: edge.to, type: edge.type };
}

function requireQuery(query: string): void {
  if (query.trim().length === 0) throw new Error("Query text is required.");
}

function requireObjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) throw new Error("objectId is required.");
  return value;
}

function isExternalReference(id: string): boolean {
  return id.startsWith("module:") || id.startsWith("package:");
}

function printHelp(): void {
  console.log(
    `Knowledge CLI\n\nCommands:\n  knowledge build [--repo <path>] [--store <path>] [--include-hidden] [--ignore <pattern>] [--max-file-bytes <n>] [--json]\n  knowledge search <query> [--repo <path>] [--store <path>] [--json]\n  knowledge graph [objectId]\n  knowledge context <query>\n  knowledge impact <objectId>\n  knowledge stats\n  knowledge doctor\n  knowledge export [--mermaid]`,
  );
}

await main(process.argv);

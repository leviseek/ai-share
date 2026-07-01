import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { BuiltContext, ContextRequest } from "../context/builder.ts";
import type { KnowledgeObjectType, RelationshipType } from "../core/types.ts";
import {
  buildCodexDryRun,
  buildCodexMockTrace,
  buildContextExperiment,
  buildDashboardMetrics,
  buildGraphView,
  buildImpactView,
  buildRepositoryTree,
  buildStudioContext,
  compareContextExperiments,
  loadStudioSnapshot,
  summarizeContextExperiment,
  type StudioSnapshot,
} from "./data.ts";
import { runCodexPlanExec, runCodexPlanExecStream, type PlanExecStreamEvent } from "./plan-exec.ts";
import {
  createContextExperimentStore,
  createStudioSessionStore,
  type ContextExperimentStore,
  type StudioSessionStore,
} from "./session-store.ts";

const DEFAULT_PORT = 3737;
const DIST_DIR = join(import.meta.dir, "public", "dist");
const PUBLIC_DIR = join(import.meta.dir, "public");

type StudioState = {
  snapshot: StudioSnapshot;
  lastContext?: BuiltContext;
  sessions: StudioSessionStore;
  experiments: ContextExperimentStore;
  pendingStreams: Map<string, ReturnType<typeof buildCodexDryRun>>;
};

async function main(argv: string[]): Promise<void> {
  const repoRoot = process.cwd();
  const port = parsePort(argv);
  const state: StudioState = {
    snapshot: await loadStudioSnapshot(repoRoot),
    sessions: createStudioSessionStore(repoRoot),
    experiments: createContextExperimentStore(repoRoot),
    pendingStreams: new Map(),
  };
  const server = Bun.serve({
    port,
    async fetch(request): Promise<Response> {
      try {
        return await routeRequest(request, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误。";
        return jsonResponse({ error: message }, 500);
      }
    },
  });
  console.log(`Repository Intelligence Studio: http://localhost:${server.port}`);
}

async function routeRequest(request: Request, state: StudioState): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/") return await staticResponse("index.html");
  if (url.pathname.startsWith("/assets/")) return await staticResponse(url.pathname.slice(1));
  if (url.pathname === "/api/repository/tree") return jsonResponse(buildRepositoryTree(state.snapshot.objects));
  if (url.pathname === "/api/graph") return jsonResponse(handleGraphRequest(url, state.snapshot));
  if (url.pathname === "/api/context") return handleContextRequest(request, state);
  if (url.pathname === "/api/impact") return jsonResponse(handleImpactRequest(url, state.snapshot));
  if (url.pathname === "/api/dashboard") return jsonResponse(buildDashboardMetrics(state.snapshot, state.lastContext));
  if (url.pathname === "/api/codex-console/mock") return handleCodexMockRequest(request, state.snapshot);
  if (url.pathname === "/api/codex-console/dry-run") return handleCodexDryRunRequest(request, state);
  if (url.pathname === "/api/codex-console/plan-exec") return handleCodexPlanExecRequest(request, state);
  if (url.pathname === "/api/codex-console/plan-exec-stream")
    return handleCodexPlanExecStreamRequest(request, url, state);
  if (url.pathname === "/api/codex-console/sessions") return handleSessionsRequest(url, state);
  if (url.pathname === "/api/codex-console/session") return handleSessionDetailRequest(url, state);
  if (url.pathname === "/api/codex-console/session-events") return handleSessionEventsRequest(url, state);
  if (url.pathname === "/api/context-lab/run") return handleContextLabRunRequest(request, state);
  if (url.pathname === "/api/context-lab/experiments") return handleContextLabExperimentsRequest(url, state);
  if (url.pathname === "/api/context-lab/experiment") return handleContextLabExperimentRequest(url, state);
  if (url.pathname === "/api/context-lab/compare") return handleContextLabCompareRequest(request, state);
  return jsonResponse({ error: "未找到请求的 Studio 资源。" }, 404);
}

function handleGraphRequest(url: URL, snapshot: StudioSnapshot): unknown {
  const seedIds = url.searchParams.getAll("seed").filter((seed) => seed.length > 0);
  const depth = Number(url.searchParams.get("depth") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "120");
  const options: Parameters<typeof buildGraphView>[1] = { seedIds, depth, limit };
  const nodeTypes = readNodeTypes(url);
  const edgeTypes = readEdgeTypes(url);
  const query = url.searchParams.get("q");
  if (nodeTypes !== undefined) options.nodeTypes = nodeTypes;
  if (edgeTypes !== undefined) options.edgeTypes = edgeTypes;
  if (query !== null) options.query = query;
  return buildGraphView(snapshot, options);
}

async function handleContextRequest(request: Request, state: StudioState): Promise<Response> {
  const body = await parseJsonObject(request);
  const query = readString(body, "query");
  if (query.length === 0) throw new Error("请提供 query。");
  const contextRequest: ContextRequest = {
    query,
    budget: { maxObjects: readPositiveInteger(body, "maxObjects", 30) },
  };
  const intent = readIntent(body);
  const paths = readStringArray(body, "paths");
  const objectIds = readStringArray(body, "objectIds");
  if (intent !== undefined) contextRequest.intent = intent;
  if (paths !== undefined) contextRequest.paths = paths;
  if (objectIds !== undefined) contextRequest.objectIds = objectIds;
  state.lastContext = buildStudioContext(state.snapshot, contextRequest);
  return jsonResponse(state.lastContext);
}

function handleImpactRequest(url: URL, snapshot: StudioSnapshot): unknown {
  const id = url.searchParams.get("id");
  if (id === null || id.length === 0) throw new Error("请提供 id。");
  return buildImpactView(snapshot, id);
}

async function handleCodexMockRequest(request: Request, snapshot: StudioSnapshot): Promise<Response> {
  const body = await parseJsonObject(request);
  const prompt = readString(body, "prompt");
  if (prompt.length === 0) throw new Error("请提供 prompt。");
  return jsonResponse(buildCodexMockTrace(snapshot, prompt));
}

async function handleCodexDryRunRequest(request: Request, state: StudioState): Promise<Response> {
  const body = await parseJsonObject(request);
  const prompt = readString(body, "prompt");
  if (prompt.length === 0) throw new Error("请提供 prompt。");
  const dryRunRequest: Parameters<typeof buildCodexDryRun>[1] = {
    prompt,
    budget: { maxObjects: readPositiveInteger(body, "maxObjects", 30) },
  };
  const intent = readIntent(body);
  if (intent !== undefined) dryRunRequest.intent = intent;
  const dryRun = buildCodexDryRun(state.snapshot, dryRunRequest);
  state.lastContext = dryRun.context;
  await state.sessions.append({
    id: dryRun.id,
    kind: "dry-run",
    timestamp: dryRun.timestamp,
    prompt: dryRun.prompt,
    intent: dryRun.intent,
    traceSteps: dryRun.trace.map((step) => step.name),
    bundleHash: dryRun.promptBundle.hash,
  });
  await state.sessions.writeDetail(dryRun.id, dryRun);
  return jsonResponse(dryRun);
}

async function handleCodexPlanExecRequest(request: Request, state: StudioState): Promise<Response> {
  const body = await parseJsonObject(request);
  const prompt = readString(body, "prompt");
  if (prompt.length === 0) throw new Error("请提供 prompt。");
  const dryRunRequest: Parameters<typeof buildCodexDryRun>[1] = {
    prompt,
    budget: { maxObjects: readPositiveInteger(body, "maxObjects", 30) },
  };
  const intent = readIntent(body);
  if (intent !== undefined) dryRunRequest.intent = intent;
  const dryRun = buildCodexDryRun(state.snapshot, dryRunRequest);
  state.lastContext = dryRun.context;
  const planExec = await runCodexPlanExec(dryRun);
  await state.sessions.append({
    id: planExec.dryRun.id,
    kind: "plan-exec",
    timestamp: planExec.dryRun.timestamp,
    prompt: planExec.dryRun.prompt,
    intent: planExec.dryRun.intent,
    traceSteps: planExec.dryRun.trace.map((step) => step.name),
    bundleHash: planExec.dryRun.promptBundle.hash,
    exitCode: planExec.execResult.exitCode,
    durationMs: planExec.execResult.durationMs,
    guardOk: planExec.guardResult.ok,
  });
  await state.sessions.writeDetail(planExec.dryRun.id, planExec);
  return jsonResponse(planExec);
}

async function handleCodexPlanExecStreamRequest(request: Request, url: URL, state: StudioState): Promise<Response> {
  if (request.method === "POST") return await createCodexPlanExecStreamRun(request, state);
  if (request.method === "GET") return streamCodexPlanExecRun(url, state);
  return jsonResponse({ error: "不支持的请求方法。" }, 405);
}

async function createCodexPlanExecStreamRun(request: Request, state: StudioState): Promise<Response> {
  const body = await parseJsonObject(request);
  const prompt = readString(body, "prompt");
  if (prompt.length === 0) throw new Error("请提供 prompt。");
  const dryRunRequest: Parameters<typeof buildCodexDryRun>[1] = {
    prompt,
    budget: { maxObjects: readPositiveInteger(body, "maxObjects", 30) },
  };
  const intent = readIntent(body);
  if (intent !== undefined) dryRunRequest.intent = intent;
  const dryRun = buildCodexDryRun(state.snapshot, dryRunRequest);
  state.lastContext = dryRun.context;
  state.pendingStreams.set(dryRun.id, dryRun);
  await state.sessions.writeDetail(dryRun.id, dryRun);
  return jsonResponse({ runId: dryRun.id, dryRun });
}

function streamCodexPlanExecRun(url: URL, state: StudioState): Response {
  const id = url.searchParams.get("id");
  if (id === null || id.length === 0) return jsonResponse({ error: "请提供 run id。" }, 400);
  const dryRun = state.pendingStreams.get(id);
  if (dryRun === undefined) return jsonResponse({ error: "未找到待执行 run。" }, 404);
  state.pendingStreams.delete(id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      void runStreamingPlanExec(controller, encoder, dryRun, state);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

async function runStreamingPlanExec(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  dryRun: ReturnType<typeof buildCodexDryRun>,
  state: StudioState,
): Promise<void> {
  const emit = async (event: PlanExecStreamEvent): Promise<void> => {
    await state.sessions.appendEvent(dryRun.id, event);
    controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  };
  try {
    const planExec = await runCodexPlanExecStream(dryRun, emit);
    await state.sessions.append({
      id: planExec.dryRun.id,
      kind: "plan-exec",
      timestamp: planExec.dryRun.timestamp,
      prompt: planExec.dryRun.prompt,
      intent: planExec.dryRun.intent,
      traceSteps: planExec.dryRun.trace.map((step) => step.name),
      bundleHash: planExec.dryRun.promptBundle.hash,
      exitCode: planExec.execResult.exitCode,
      durationMs: planExec.execResult.durationMs,
      guardOk: planExec.guardResult.ok,
    });
    await state.sessions.writeDetail(planExec.dryRun.id, planExec);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan Exec stream failed.";
    const event: PlanExecStreamEvent = { timestamp: new Date().toISOString(), type: "run_error", payload: { message } };
    await state.sessions.appendEvent(dryRun.id, event);
    controller.enqueue(encoder.encode(`event: run_error\ndata: ${JSON.stringify(event)}\n\n`));
  } finally {
    controller.close();
  }
}

async function handleSessionsRequest(url: URL, state: StudioState): Promise<Response> {
  const limit = Number(url.searchParams.get("limit") ?? "20");
  return jsonResponse(await state.sessions.recent(Number.isInteger(limit) && limit > 0 ? limit : 20));
}

async function handleSessionDetailRequest(url: URL, state: StudioState): Promise<Response> {
  const id = url.searchParams.get("id");
  if (id === null || id.length === 0) throw new Error("请提供 session id。");
  const detail = await state.sessions.readDetail(id);
  if (detail === undefined) return jsonResponse({ error: "未找到 session detail。" }, 404);
  return jsonResponse(detail);
}

async function handleSessionEventsRequest(url: URL, state: StudioState): Promise<Response> {
  const id = url.searchParams.get("id");
  if (id === null || id.length === 0) throw new Error("请提供 session id。");
  return jsonResponse(await state.sessions.readEvents(id));
}

async function handleContextLabRunRequest(request: Request, state: StudioState): Promise<Response> {
  const body = await parseJsonObject(request);
  const prompt = readString(body, "prompt");
  if (prompt.length === 0) throw new Error("请提供 prompt。");
  const experimentRequest: Parameters<typeof buildContextExperiment>[1] = {
    prompt,
    maxObjects: readPositiveInteger(body, "maxObjects", 30),
  };
  const name = readOptionalString(body, "name");
  const intent = readIntent(body);
  const seeds = readStringArray(body, "seeds");
  const filters = readGraphFilters(body);
  if (name !== undefined) experimentRequest.name = name;
  if (intent !== undefined) experimentRequest.intent = intent;
  if (seeds !== undefined) experimentRequest.seeds = seeds;
  if (filters !== undefined) experimentRequest.filters = filters;
  const experiment = buildContextExperiment(state.snapshot, experimentRequest);
  state.lastContext = experiment.context;
  await state.experiments.append(summarizeContextExperiment(experiment));
  await state.experiments.writeDetail(experiment.id, experiment);
  return jsonResponse(experiment);
}

async function handleContextLabExperimentsRequest(url: URL, state: StudioState): Promise<Response> {
  const limit = Number(url.searchParams.get("limit") ?? "20");
  return jsonResponse(await state.experiments.recent(Number.isInteger(limit) && limit > 0 ? limit : 20));
}

async function handleContextLabExperimentRequest(url: URL, state: StudioState): Promise<Response> {
  const id = url.searchParams.get("id");
  if (id === null || id.length === 0) throw new Error("请提供 experiment id。");
  const detail = await state.experiments.readDetail(id);
  if (detail === undefined) return jsonResponse({ error: "未找到 experiment detail。" }, 404);
  return jsonResponse(detail);
}

async function handleContextLabCompareRequest(request: Request, state: StudioState): Promise<Response> {
  const body = await parseJsonObject(request);
  const leftId = readString(body, "leftId");
  const rightId = readString(body, "rightId");
  if (leftId.length === 0 || rightId.length === 0) throw new Error("请提供 leftId 和 rightId。");
  const left = await state.experiments.readDetail(leftId);
  const right = await state.experiments.readDetail(rightId);
  if (left === undefined || right === undefined) return jsonResponse({ error: "未找到要对比的 experiment。" }, 404);
  return jsonResponse(compareContextExperiments(left, right));
}

async function staticResponse(path: string): Promise<Response> {
  const safePath = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (safePath.includes("..")) return jsonResponse({ error: "非法静态资源路径。" }, 400);
  return await readStaticFile(safePath);
}

async function readStaticFile(path: string): Promise<Response> {
  for (const root of [DIST_DIR, PUBLIC_DIR]) {
    try {
      const file = await readFile(join(root, path));
      return new Response(file, { headers: { "content-type": contentType(path) } });
    } catch {
      // Try next static root.
    }
  }
  return jsonResponse({ error: "未找到静态资源。" }, 404);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value = (await request.json()) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("请求体必须是 JSON object。");
  return value as Record<string, unknown>;
}

function readNodeTypes(url: URL): KnowledgeObjectType[] | undefined {
  const values = url.searchParams.getAll("nodeType");
  const nodeTypes = values.filter(isKnowledgeObjectType);
  return nodeTypes.length === 0 ? undefined : nodeTypes;
}

function readEdgeTypes(url: URL): RelationshipType[] | undefined {
  const values = url.searchParams.getAll("edgeType");
  const edgeTypes = values.filter(isRelationshipType);
  return edgeTypes.length === 0 ? undefined : edgeTypes;
}

function isKnowledgeObjectType(value: string): value is KnowledgeObjectType {
  return [
    "Project",
    "Directory",
    "Module",
    "File",
    "Document",
    "Section",
    "Workflow",
    "Spec",
    "Rule",
    "Pattern",
    "Prompt",
    "Example",
    "Task",
    "Milestone",
    "Agent",
    "MCP",
    "CodeFile",
    "CodeSymbol",
    "Package",
    "Config",
    "Script",
    "Test",
    "GeneratedArtifact",
  ].includes(value);
}

function isRelationshipType(value: string): value is RelationshipType {
  return [
    "contains",
    "belongs_to",
    "implements",
    "depends_on",
    "references",
    "uses",
    "extends",
    "imports",
    "calls",
    "owns",
    "related_to",
    "supports",
    "requires",
    "generated_from",
    "generates",
    "documents",
    "tested_by",
    "configures",
    "declares",
    "exports",
  ].includes(value);
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = readString(body, key);
  return value.length === 0 ? undefined : value;
}

function readGraphFilters(body: Record<string, unknown>): Parameters<typeof buildContextExperiment>[1]["filters"] {
  const value = body.filters;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const filters: NonNullable<Parameters<typeof buildContextExperiment>[1]["filters"]> = {};
  const seedIds = readStringArray(record, "seedIds");
  const nodeTypesValue = record.nodeTypes;
  const edgeTypesValue = record.edgeTypes;
  const query = readString(record, "query");
  const depth = record.depth;
  const limit = record.limit;
  if (seedIds !== undefined) filters.seedIds = seedIds;
  if (typeof depth === "number") filters.depth = depth;
  if (Array.isArray(nodeTypesValue)) {
    const nodeTypes = nodeTypesValue.filter(
      (item): item is KnowledgeObjectType => typeof item === "string" && isKnowledgeObjectType(item),
    );
    if (nodeTypes.length > 0) filters.nodeTypes = nodeTypes;
  }
  if (Array.isArray(edgeTypesValue)) {
    const edgeTypes = edgeTypesValue.filter(
      (item): item is RelationshipType => typeof item === "string" && isRelationshipType(item),
    );
    if (edgeTypes.length > 0) filters.edgeTypes = edgeTypes;
  }
  if (query.length > 0) filters.query = query;
  if (typeof limit === "number") filters.limit = limit;
  return filters;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readPositiveInteger(body: Record<string, unknown>, key: string, fallback: number): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function readIntent(body: Record<string, unknown>): ContextRequest["intent"] | undefined {
  const value = body.intent;
  if (
    value === "implement" ||
    value === "debug" ||
    value === "review" ||
    value === "explain" ||
    value === "plan" ||
    value === "test"
  ) {
    return value;
  }
  return undefined;
}

function contentType(path: string): string {
  const extension = extname(path);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function parsePort(argv: string[]): number {
  const portArg = argv.find((arg) => arg.startsWith("--port="));
  if (portArg === undefined) return DEFAULT_PORT;
  const parsed = Number(portArg.slice("--port=".length));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("无效的 --port。");
  return parsed;
}

await main(process.argv);

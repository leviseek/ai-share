import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { BuiltContext, ContextRequest } from "../context/builder.ts";
import {
  buildCodexDryRun,
  buildCodexMockTrace,
  buildDashboardMetrics,
  buildGraphView,
  buildImpactView,
  buildRepositoryTree,
  buildStudioContext,
  loadStudioSnapshot,
  type StudioSnapshot,
} from "./data.ts";
import { createStudioSessionStore, type StudioSessionStore } from "./session-store.ts";

const DEFAULT_PORT = 3737;
const DIST_DIR = join(import.meta.dir, "public", "dist");
const PUBLIC_DIR = join(import.meta.dir, "public");

type StudioState = {
  snapshot: StudioSnapshot;
  lastContext?: BuiltContext;
  sessions: StudioSessionStore;
};

async function main(argv: string[]): Promise<void> {
  const repoRoot = process.cwd();
  const port = parsePort(argv);
  const state: StudioState = {
    snapshot: await loadStudioSnapshot(repoRoot),
    sessions: createStudioSessionStore(repoRoot),
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
  if (url.pathname === "/api/codex-console/sessions") return handleSessionsRequest(url, state);
  return jsonResponse({ error: "未找到请求的 Studio 资源。" }, 404);
}

function handleGraphRequest(url: URL, snapshot: StudioSnapshot): unknown {
  const seed = url.searchParams.get("seed");
  const depth = Number(url.searchParams.get("depth") ?? "1");
  return buildGraphView(snapshot, seed === null || seed.length === 0 ? [] : [seed], Number.isFinite(depth) ? depth : 1);
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
    timestamp: dryRun.timestamp,
    prompt: dryRun.prompt,
    intent: dryRun.intent,
    traceSteps: dryRun.trace.map((step) => step.name),
    bundleHash: dryRun.promptBundle.hash,
  });
  return jsonResponse(dryRun);
}

async function handleSessionsRequest(url: URL, state: StudioState): Promise<Response> {
  const limit = Number(url.searchParams.get("limit") ?? "20");
  return jsonResponse(await state.sessions.recent(Number.isInteger(limit) && limit > 0 ? limit : 20));
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

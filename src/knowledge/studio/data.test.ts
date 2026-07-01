import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import type { GraphEdge, GraphNode, KnowledgeObject } from "../core/types.ts";
import {
  buildCodexDryRun,
  buildCodexMockTrace,
  buildDashboardMetrics,
  buildGraphView,
  buildRepositoryTree,
  buildStudioContext,
  type StudioSnapshot,
} from "./data.ts";
import {
  buildPlanExecGuard,
  composeReadonlyPlanPrompt,
  event,
  runCodexPlanExec,
  runCodexPlanExecStream,
} from "./plan-exec.ts";
import { createStudioSessionStore } from "./session-store.ts";

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

  test("filters graph views by node type, edge type, query, and limit", () => {
    const byType = buildGraphView(fixtureSnapshot(), { nodeTypes: ["CodeFile"], edgeTypes: ["contains"] });
    expect(byType.nodes.every((node) => node.type === "CodeFile")).toBe(true);
    expect(byType.edges).toHaveLength(0);

    const byQuery = buildGraphView(fixtureSnapshot(), { query: "main", edgeTypes: ["contains"] });
    expect(byQuery.nodes.map((node) => node.id)).toContain("codefile:src/main.ts");
    expect(byQuery.edges.every((edge) => edge.type === "contains")).toBe(true);

    const limited = buildGraphView(fixtureSnapshot(), { limit: 1 });
    expect(limited.nodes).toHaveLength(1);
    expect(limited.edges).toHaveLength(0);
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

  test("builds Codex dry run trace and prompt bundle", () => {
    const dryRun = buildCodexDryRun(fixtureSnapshot(), { prompt: "请设计 main 的修改方案" }, now);
    expect(dryRun.intent).toBe("plan");
    expect(dryRun.trace.map((step) => step.name)).toEqual([
      "infer_intent",
      "search",
      "select_seeds",
      "build_context",
      "analyze_impact",
      "compose_prompt_bundle",
    ]);
    expect(dryRun.promptBundle.task).toBe("请设计 main 的修改方案");
    expect(dryRun.promptBundle.markdown).toContain("# Codex Dry Run Context Bundle");
    expect(dryRun.promptBundle.relevantPaths).toContain("src/main.ts");
    expect(dryRun.promptBundle.hash.length).toBeGreaterThan(0);
  });

  test("stores and reads recent Studio sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-session-"));
    const store = createStudioSessionStore(root);
    await store.append({
      id: "one",
      kind: "dry-run",
      timestamp: now,
      prompt: "first",
      intent: "plan",
      traceSteps: ["infer_intent"],
      bundleHash: "hash-one",
    });
    await store.append({
      id: "two",
      kind: "plan-exec",
      timestamp: now,
      prompt: "second",
      intent: "debug",
      traceSteps: ["search"],
      bundleHash: "hash-two",
    });
    const dryRun = buildCodexDryRun(fixtureSnapshot(), { prompt: "second" }, now);
    await store.writeDetail("two", dryRun);
    await store.appendEvent("two", event("run_started", { id: "two" }));
    const recent = await store.recent(1);
    const detail = await store.readDetail("two");
    const events = await store.readEvents("two");
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe("two");
    expect(recent[0]?.kind).toBe("plan-exec");
    expect(detail).toBeDefined();
    expect(events[0]?.type).toBe("run_started");
  });

  test("composes readonly Codex plan exec prompt", () => {
    const dryRun = buildCodexDryRun(fixtureSnapshot(), { prompt: "请设计 main 的修改方案" }, now);
    const prompt = composeReadonlyPlanPrompt(dryRun);
    expect(prompt).toContain("只读 Plan Exec 模式");
    expect(prompt).toContain("禁止编辑文件");
    expect(prompt).toContain("# Codex Dry Run Context Bundle");
  });

  test("runs Codex plan exec through injectable runner", async () => {
    const dryRun = buildCodexDryRun(fixtureSnapshot(), { prompt: "请设计 main 的修改方案" }, now);
    const result = await runCodexPlanExec(
      dryRun,
      ({ prompt, timeoutMs }) =>
        Promise.resolve({
          stdout: `planned ${prompt.length}`,
          stderr: "",
          exitCode: 0,
          durationMs: timeoutMs,
          timedOut: false,
        }),
      120_000,
      () => Promise.resolve(""),
    );
    expect(result.guardResult.ok).toBe(true);
    expect(result.guardResult.command).toBe("codex exec");
    expect(result.execResult.exitCode).toBe(0);
    expect(result.execResult.stdout).toContain("planned");
  });

  test("marks plan exec guard failure when git status changes", () => {
    const guard = buildPlanExecGuard(" M before.ts", " M before.ts\n?? after.ts");
    expect(guard.ok).toBe(false);
    expect(guard.git.changedFiles).toContain("after.ts");
    expect(guard.messages).toContain("Plan Exec produced workspace changes; review manually.");
  });

  test("streams Codex plan exec events through injectable runner", async () => {
    const dryRun = buildCodexDryRun(fixtureSnapshot(), { prompt: "请设计 main 的修改方案" }, now);
    const events = [] as string[];
    const result = await runCodexPlanExecStream(
      dryRun,
      (item) => {
        events.push(item.type);
      },
      async ({ emit }) => {
        await emit(event("stdout", { chunk: "hello" }));
        await emit(event("stderr", { chunk: "warn" }));
        return { stdout: "hello", stderr: "warn", exitCode: 0, durationMs: 3, timedOut: false };
      },
      120_000,
      () => Promise.resolve(""),
    );
    expect(events).toEqual(["run_started", "dry_run_ready", "stdout", "stderr", "git_guard", "run_done"]);
    expect(result.execResult.stdout).toBe("hello");
    expect(result.guardResult.ok).toBe(true);
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

import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import type { GraphEdge, GraphNode, KnowledgeObject } from "../core/types.ts";
import {
  buildCodexDryRun,
  buildCodexMockTrace,
  buildCodexDryRunFromRecipe,
  buildContextExperiment,
  buildContextRecipeFromExperiment,
  buildDashboardMetrics,
  buildGraphView,
  buildRepositoryTree,
  buildStudioContext,
  compareContextExperiments,
  markContextRecipeUsed,
  summarizeContextExperiment,
  summarizeContextRecipe,
  type StudioSnapshot,
} from "./data.ts";
import {
  buildPlanExecGuard,
  composeReadonlyPlanPrompt,
  event,
  runCodexPlanExec,
  runCodexPlanExecStream,
} from "./plan-exec.ts";
import { createContextExperimentStore, createContextRecipeStore, createStudioSessionStore } from "./session-store.ts";
import { importRepositoryFromFormData, type RepositoryImportSummary } from "./server.ts";

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

  test("evaluates context quality with gaps and recommendations", () => {
    const goodContext = buildStudioContext(fixtureSnapshot(), { query: "main", objectIds: ["codefile:src/main.ts"] });
    expect(goodContext.quality?.score).toBeGreaterThan(0);
    expect(goodContext.quality?.recommendations.some((item) => item.action === "inspect_impact")).toBe(true);

    const weakContext = buildStudioContext(fixtureSnapshot(), { query: "zzzz-no-match" });
    expect(weakContext.quality?.grade).toBe("poor");
    expect(weakContext.quality?.gaps.map((gap) => gap.code)).toContain("no_search_hits");
    expect(weakContext.quality?.recommendations.map((item) => item.action)).toContain("add_query_terms");
  });

  test("dashboard exposes context quality summary", () => {
    const context = buildStudioContext(fixtureSnapshot(), { query: "main", objectIds: ["codefile:src/main.ts"] });
    const metrics = buildDashboardMetrics(fixtureSnapshot(), context);
    expect(metrics.contextQuality?.score).toBe(context.quality?.score);
    expect(metrics.contextQuality?.recommendations).toBe(context.quality?.recommendations.length);
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

  test("exposes enriched graph node display fields and searchable metadata", () => {
    const bySummary = buildGraphView(fixtureSnapshot(), { query: "bootstrap" });
    const mainNode = bySummary.nodes.find((node) => node.id === "codefile:src/main.ts");
    expect(mainNode?.summary).toBe("Main application bootstrap.");
    expect(mainNode?.tags).toContain("entrypoint");
    expect(mainNode?.language).toBe("typescript");
    expect(mainNode?.updatedAt).toBe(now);
    expect(mainNode?.hash).toBe("codefile:src/main.ts");

    const byMetadata = buildGraphView(fixtureSnapshot(), { query: "linecount" });
    expect(byMetadata.nodes.map((node) => node.id)).toContain("codefile:src/main.ts");
  });

  test("builds observable Codex mock trace", () => {
    const trace = buildCodexMockTrace(fixtureSnapshot(), "请设计 main 的修改方案");
    expect(trace.intent).toBe("plan");
    expect(trace.steps.map((step) => step.name)).toEqual([
      "infer_intent",
      "search",
      "context",
      "impact",
      "evaluate_context_quality",
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
      "evaluate_context_quality",
      "compose_prompt_bundle",
    ]);
    expect(dryRun.promptBundle.task).toBe("请设计 main 的修改方案");
    expect(dryRun.promptBundle.markdown).toContain("# Codex Dry Run Context Bundle");
    expect(dryRun.promptBundle.markdown).toContain("## Context Quality");
    expect(dryRun.context.quality?.grade).toBeDefined();
    expect(dryRun.promptBundle.relevantPaths).toContain("src/main.ts");
    expect(dryRun.promptBundle.hash.length).toBeGreaterThan(0);
  });

  test("builds context experiments with explicit and inferred seeds", () => {
    const explicit = buildContextExperiment(
      fixtureSnapshot(),
      {
        name: "main plan",
        prompt: "请设计 main 的修改方案",
        intent: "plan",
        seeds: ["codefile:src/main.ts"],
        filters: { query: "main", depth: 2, limit: 40 },
        maxObjects: 12,
      },
      now,
    );
    expect(explicit.name).toBe("main plan");
    expect(explicit.intent).toBe("plan");
    expect(explicit.seeds).toEqual(["codefile:src/main.ts"]);
    expect(explicit.maxObjects).toBe(12);
    expect(explicit.trace.map((step) => step.name)).toContain("compose_prompt_bundle");
    expect(explicit.context.quality?.score).toBeGreaterThan(0);
    expect(explicit.promptBundle.relevantPaths).toContain("src/main.ts");

    const inferred = buildContextExperiment(fixtureSnapshot(), { prompt: "main implementation", maxObjects: 5 }, now);
    expect(inferred.seeds).toContain("codefile:src/main.ts");
  });

  test("stores and reads recent context experiments", async () => {
    const root = await mkdtemp(join(tmpdir(), "context-experiment-"));
    const store = createContextExperimentStore(root);
    const first = buildContextExperiment(fixtureSnapshot(), { prompt: "main plan" }, "2026-07-01T00:00:00.000Z");
    const second = buildContextExperiment(fixtureSnapshot(), { prompt: "orphan debug" }, "2026-07-01T00:00:01.000Z");
    await store.append(summarizeContextExperiment(first));
    await store.writeDetail(first.id, first);
    await store.append(summarizeContextExperiment(second));
    await store.writeDetail(second.id, second);

    const recent = await store.recent(1);
    const detail = await store.readDetail(second.id);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(second.id);
    expect(detail?.prompt).toBe("orphan debug");
  });

  test("compares context experiments", () => {
    const left = buildContextExperiment(
      fixtureSnapshot(),
      { prompt: "zzzz-no-match", seeds: ["codefile:src/orphan.ts"], maxObjects: 1 },
      "2026-07-01T00:00:00.000Z",
    );
    const right = buildContextExperiment(
      fixtureSnapshot(),
      { prompt: "请设计 main 的修改方案", seeds: ["codefile:src/main.ts"], maxObjects: 10 },
      "2026-07-01T00:00:01.000Z",
    );
    const comparison = compareContextExperiments(left, right);
    expect(comparison.leftId).toBe(left.id);
    expect(comparison.rightId).toBe(right.id);
    expect(comparison.bundleChanged).toBe(true);
    expect(comparison.objects.added).toContain("codefile:src/main.ts");
    expect(comparison.objects.removed).toContain("codefile:src/orphan.ts");
    expect(comparison.relevantPaths.added).toContain("src/main.ts");
    expect(comparison.scoreDelta).toBe((right.context.quality?.score ?? 0) - (left.context.quality?.score ?? 0));
  });

  test("builds context recipes from experiments", () => {
    const experiment = buildContextExperiment(
      fixtureSnapshot(),
      { name: "main plan", prompt: "请设计 main 的修改方案", seeds: ["codefile:src/main.ts"], maxObjects: 8 },
      now,
    );
    const recipe = buildContextRecipeFromExperiment(experiment, now);
    expect(recipe.name).toBe("main plan");
    expect(recipe.sourceExperimentId).toBe(experiment.id);
    expect(recipe.seeds).toEqual(["codefile:src/main.ts"]);
    expect(recipe.baseline.qualityScore).toBe(experiment.context.quality?.score);
    expect(recipe.baseline.bundleHash).toBe(experiment.promptBundle.hash);
    expect(summarizeContextRecipe(recipe).qualityGrade).toBe(experiment.context.quality?.grade);
  });

  test("stores and reads recent context recipes", async () => {
    const root = await mkdtemp(join(tmpdir(), "context-recipe-"));
    const store = createContextRecipeStore(root);
    const experiment = buildContextExperiment(fixtureSnapshot(), { name: "main plan", prompt: "main plan" }, now);
    const recipe = buildContextRecipeFromExperiment(experiment, now);
    const used = markContextRecipeUsed(recipe, "2026-07-01T00:00:01.000Z");
    await store.append(summarizeContextRecipe(recipe));
    await store.writeDetail(recipe.id, recipe);
    await store.append(summarizeContextRecipe(used));
    await store.writeDetail(used.id, used);
    const recent = await store.recent(1);
    const detail = await store.readDetail(recipe.id);
    expect(recent[0]?.id).toBe(recipe.id);
    expect(recent[0]?.useCount).toBe(1);
    expect(detail?.lastUsedAt).toBe("2026-07-01T00:00:01.000Z");
  });

  test("builds Codex dry run from context recipe", () => {
    const experiment = buildContextExperiment(
      fixtureSnapshot(),
      { name: "main plan", prompt: "请设计 main 的修改方案", seeds: ["codefile:src/main.ts"], maxObjects: 8 },
      now,
    );
    const recipe = buildContextRecipeFromExperiment(experiment, now);
    const dryRun = buildCodexDryRunFromRecipe(fixtureSnapshot(), recipe, "请实现 main", now);
    expect(dryRun.recipeId).toBe(recipe.id);
    expect(dryRun.recipeName).toBe(recipe.name);
    expect(dryRun.prompt).toBe("请实现 main");
    expect(dryRun.selectedSeeds).toEqual(["codefile:src/main.ts"]);
    expect(dryRun.promptBundle.relevantPaths).toContain("src/main.ts");
  });

  test("recipe dry run falls back to text search when seeds are empty", () => {
    const experiment = buildContextExperiment(
      fixtureSnapshot(),
      { name: "empty seeds", prompt: "main", seeds: [] },
      now,
    );
    const recipe = { ...buildContextRecipeFromExperiment(experiment, now), seeds: [] };
    const dryRun = buildCodexDryRunFromRecipe(fixtureSnapshot(), recipe, "main", now);
    expect(dryRun.selectedSeeds).toContain("codefile:src/main.ts");
  });

  test("imports a dragged repository folder into an isolated knowledge snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-import-"));
    const state: { snapshot: StudioSnapshot; activeImport?: RepositoryImportSummary } = { snapshot: fixtureSnapshot() };
    const formData = new FormData();
    formData.append(
      "files",
      uploadFile("demo/package.json", JSON.stringify({ name: "demo", scripts: { check: "tsc" } })),
    );
    formData.append(
      "files",
      uploadFile("demo/src/main.ts", "export function main() { return 1; }\n"),
      "demo/src/main.ts",
    );

    const summary = await importRepositoryFromFormData(formData, state, root);
    const manifest = JSON.parse(await readFile(join(summary.storeRoot, "manifest.json"), "utf-8")) as {
      buildHash: string;
    };

    expect(summary.objects).toBeGreaterThan(0);
    expect(summary.edges).toBeGreaterThan(0);
    expect(summary.diagnostics).toBe(0);
    expect(manifest.buildHash).toBe(summary.buildHash);
    expect(state.snapshot.objects.some((object) => object.id === "package:demo")).toBe(true);
  });

  test("rejects unsafe uploaded repository paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-import-unsafe-"));
    const state: { snapshot: StudioSnapshot; activeImport?: RepositoryImportSummary } = { snapshot: fixtureSnapshot() };
    const formData = new FormData();
    formData.append("files", uploadFile("../escape.ts", "export const nope = true;\n"), "escape.ts");
    formData.append("paths", "../escape.ts");

    try {
      await importRepositoryFromFormData(formData, state, root);
      throw new Error("Expected unsafe import path to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("非法导入路径");
    }
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

function uploadFile(relativePath: string, content: string): File {
  const file = new File([content], relativePath.split("/").at(-1) ?? "file.txt", { type: "text/plain" });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath, configurable: true });
  return file;
}

function fixtureSnapshot(): StudioSnapshot {
  const objects = [
    object("dir:src", "Directory", "src", "src"),
    {
      ...object("codefile:src/main.ts", "CodeFile", "main.ts", "src/main.ts"),
      summary: "Main application bootstrap.",
      tags: ["entrypoint"],
      metadata: { lineCount: 12 },
      language: "typescript",
    },
    object("codefile:src/orphan.ts", "CodeFile", "orphan.ts", "src/orphan.ts"),
  ];
  const nodes: GraphNode[] = objects.map((item) => {
    const node: GraphNode = {
      id: item.id,
      objectId: item.id,
      type: item.type,
      label: item.title,
      metadata: item.metadata,
      tags: item.tags,
      updatedAt: item.updated_at,
      hash: item.hash,
    };
    return {
      ...node,
      ...(item.summary === undefined ? {} : { summary: item.summary }),
      ...(item.path === undefined ? {} : { path: item.path }),
      ...(item.language === undefined ? {} : { language: item.language }),
    };
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

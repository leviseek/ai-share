import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  type D3DragEvent,
  type D3ZoomEvent,
  type SimulationNodeDatum,
} from "d3";
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "./styles.css";

type TreeNode = {
  name: string;
  path: string;
  kind: "directory" | "file";
  objectIds: string[];
  children: TreeNode[];
};

type GraphNode = {
  id: string;
  objectId: string;
  type: string;
  label: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
};

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type ContextQuality = {
  score: number;
  grade: string;
  metrics: Record<string, number>;
  gaps: { code: string; severity: string; message: string }[];
  recommendations: { action: string; title: string; reason: string; confidence: string }[];
};

type Dashboard = {
  objects: number;
  nodes: number;
  edges: number;
  orphanNodes: number;
  brokenEdges: number;
  contextCoverage: number;
  contextQuality?: { score: number; grade: string; gaps: number; recommendations: number };
};

type TraceStep = {
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
};

type DryRun = {
  id: string;
  timestamp: string;
  prompt: string;
  intent: string;
  selectedSeeds: string[];
  trace: TraceStep[];
  context: {
    summary: string;
    objects: { id: string; type: string; path?: string }[];
    diagnostics: string[];
    quality?: ContextQuality;
  };
  impact: GraphData;
  quality?: ContextQuality;
  promptBundle: { markdown: string; hash: string; relevantPaths: string[] };
};

type SessionSummary = {
  id: string;
  kind?: "dry-run" | "plan-exec";
  timestamp: string;
  prompt: string;
  intent: string;
  traceSteps: string[];
  bundleHash: string;
  exitCode?: number | null;
  durationMs?: number;
  guardOk?: boolean;
};

type PlanExec = {
  dryRun: DryRun;
  guardResult: {
    ok: boolean;
    command: string;
    messages: string[];
    git: { beforeStatus: string; afterStatus: string; changedFiles: string[] };
  };
  execResult: { stdout: string; stderr: string; exitCode: number | null; durationMs: number; timedOut: boolean };
};

type GraphFilters = {
  query: string;
  depth: number;
  limit: number;
  nodeTypes: string[];
  edgeTypes: string[];
};

type GraphNodeDetail = {
  node: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
};

type SessionDetail = DryRun | PlanExec;

type StreamEvent = { timestamp: string; type: string; payload: unknown };

type Toast = {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
};

type StudioPreferences = {
  graphFilters: GraphFilters;
  graphSeeds: string[];
  selectedObjectId: string;
  contextQuery: string;
  prompt: string;
  helpOpen: boolean;
  inspectorCollapsed: boolean;
};

const nodeTypeOptions = [
  "Project",
  "Directory",
  "Document",
  "Rule",
  "Agent",
  "CodeFile",
  "CodeSymbol",
  "Config",
  "Script",
  "Test",
  "GeneratedArtifact",
];
const edgeTypeOptions = [
  "contains",
  "imports",
  "depends_on",
  "references",
  "tested_by",
  "configures",
  "generated_from",
  "generates",
  "documents",
  "declares",
  "exports",
];
const defaultFilters: GraphFilters = { query: "", depth: 1, limit: 120, nodeTypes: [], edgeTypes: [] };
const preferencesKey = "rie.studio.preferences.v1";
const defaultPreferences: StudioPreferences = {
  graphFilters: defaultFilters,
  graphSeeds: [],
  selectedObjectId: "",
  contextQuery: "设计 Repository Intelligence Studio v2",
  prompt: "请规划一个知识引擎驱动的 Codex 改动",
  helpOpen: false,
  inspectorCollapsed: false,
};

function App() {
  const [preferences, setPreferences] = useState(() => readStudioPreferences());
  const [tree, setTree] = useState<TreeNode | undefined>();
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [dashboard, setDashboard] = useState<Dashboard | undefined>();
  const [selectedObjectId, setSelectedObjectId] = useState(preferences.selectedObjectId);
  const [graphSeeds, setGraphSeeds] = useState<string[]>(preferences.graphSeeds);
  const [graphFilters, setGraphFilters] = useState<GraphFilters>(preferences.graphFilters);
  const [contextQuery, setContextQuery] = useState(preferences.contextQuery);
  const [contextOutput, setContextOutput] = useState("");
  const [contextQuality, setContextQuality] = useState<ContextQuality | undefined>();
  const [impactOutput, setImpactOutput] = useState("");
  const [prompt, setPrompt] = useState(preferences.prompt);
  const [dryRun, setDryRun] = useState<DryRun | undefined>();
  const [planExec, setPlanExec] = useState<PlanExec | undefined>();
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | undefined>();
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeActions, setActiveActions] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [helpOpen, setHelpOpen] = useState(preferences.helpOpen);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(preferences.inspectorCollapsed);

  const selectedDetail = useMemo(() => graphDetail(graph, selectedObjectId), [graph, selectedObjectId]);

  const graphSearchRef = useRef<HTMLInputElement>(null);
  const isBusy = activeActions.length > 0;

  useEffect(() => {
    writeStudioPreferences(preferences);
  }, [preferences]);

  function updatePreferences(patch: Partial<StudioPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
  }

  function setSelectedObject(value: string) {
    setSelectedObjectId(value);
    updatePreferences({ selectedObjectId: value });
  }

  function setContextQueryValue(value: string) {
    setContextQuery(value);
    updatePreferences({ contextQuery: value });
  }

  function setPromptValue(value: string) {
    setPrompt(value);
    updatePreferences({ prompt: value });
  }

  function showToast(kind: Toast["kind"], message: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((items) => [...items, { id, kind, message }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), kind === "error" ? 7000 : 3000);
  }

  function dismissToasts() {
    setToasts([]);
  }

  async function runAction(label: string, task: () => Promise<void>, successMessage?: string) {
    setActiveActions((items) => [...items, label]);
    try {
      await task();
      if (successMessage !== undefined) showToast("success", successMessage);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setActiveActions((items) => items.filter((item) => item !== label));
    }
  }

  function toggleHelp() {
    const next = !helpOpen;
    setHelpOpen(next);
    updatePreferences({ helpOpen: next });
  }

  function toggleInspector() {
    const next = !inspectorCollapsed;
    setInspectorCollapsed(next);
    updatePreferences({ inspectorCollapsed: next });
  }

  async function refresh() {
    const [treeData, graphData, dashboardData, sessionData] = await Promise.all([
      getJson<TreeNode>("/api/repository/tree"),
      loadGraph(graphSeeds, graphFilters),
      getJson<Dashboard>("/api/dashboard"),
      getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"),
    ]);
    setTree(treeData);
    setGraph(graphData);
    setDashboard(dashboardData);
    setSessions(sessionData);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function applyGraph(nextSeeds = graphSeeds, nextFilters = graphFilters) {
    setGraphSeeds(nextSeeds);
    setGraphFilters(nextFilters);
    updatePreferences({ graphSeeds: nextSeeds, graphFilters: nextFilters });
    setGraph(await loadGraph(nextSeeds, nextFilters));
  }

  async function selectObject(id: string) {
    setSelectedObject(id);
    await applyGraph([id], { ...graphFilters, depth: Math.max(graphFilters.depth, 2) });
  }

  async function addGraphSeed(id: string) {
    const nextSeeds = [...new Set([...graphSeeds, id])];
    setSelectedObject(id);
    await applyGraph(nextSeeds, graphFilters);
  }

  async function resetGraph() {
    setSelectedObject("");
    await applyGraph([], defaultFilters);
  }

  async function buildContext() {
    const result = await postJson<{
      summary: string;
      objects: { id: string; type: string; path?: string }[];
      diagnostics: string[];
      graph: GraphData;
      quality?: ContextQuality;
    }>("/api/context", { query: contextQuery, intent: "plan", maxObjects: 30 });
    setContextOutput(
      JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics, objects: result.objects }, null, 2),
    );
    setContextQuality(result.quality);
    setGraph(result.graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
  }

  async function buildContextForSelected() {
    if (selectedObjectId.length === 0) return;
    const result = await postJson<{
      summary: string;
      objects: { id: string; type: string; path?: string }[];
      diagnostics: string[];
      graph: GraphData;
      quality?: ContextQuality;
    }>("/api/context", { query: selectedObjectId, intent: "plan", objectIds: [selectedObjectId], maxObjects: 30 });
    setContextOutput(
      JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics, objects: result.objects }, null, 2),
    );
    setContextQuality(result.quality);
    setGraph(result.graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
  }

  async function analyzeImpact() {
    if (selectedObjectId.length === 0) return;
    const result = await getJson<GraphData>(`/api/impact?id=${encodeURIComponent(selectedObjectId)}`);
    setImpactOutput(JSON.stringify({ nodes: result.nodes.length, edges: result.edges.length }, null, 2));
    setGraph(result);
  }

  async function runDryRun() {
    const result = await postJson<DryRun>("/api/codex-console/dry-run", { prompt, maxObjects: 30 });
    setDryRun(result);
    setContextQuality(result.context.quality);
    setGraph(result.impact.nodes.length > 0 ? result.impact : result.context === undefined ? graph : result.impact);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
    setSessions(await getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"));
  }

  async function runPlanExec() {
    const result = await postJson<PlanExec>("/api/codex-console/plan-exec", { prompt, maxObjects: 30 });
    setPlanExec(result);
    setSessionDetail(result);
    setDryRun(result.dryRun);
    setContextQuality(result.dryRun.context.quality);
    setGraph(result.dryRun.impact.nodes.length > 0 ? result.dryRun.impact : graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
    setSessions(await getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"));
  }

  async function runPlanExecStream() {
    setStreamEvents([]);
    setStreamStatus("starting");
    const created = await postJson<{ runId: string; dryRun: DryRun }>("/api/codex-console/plan-exec-stream", {
      prompt,
      maxObjects: 30,
    });
    setDryRun(created.dryRun);
    setContextQuality(created.dryRun.context.quality);
    setStreamStatus("running");
    const source = new EventSource(`/api/codex-console/plan-exec-stream?id=${encodeURIComponent(created.runId)}`);
    for (const type of ["run_started", "dry_run_ready", "stdout", "stderr", "git_guard", "run_done", "run_error"]) {
      source.addEventListener(type, (event) => {
        const streamEvent = parseStreamEvent(event);
        if (streamEvent === undefined) return;
        setStreamEvents((items) => [...items, streamEvent]);
        if (streamEvent.type === "run_done" || streamEvent.type === "run_error") {
          setStreamStatus(streamEvent.type);
          source.close();
          void getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20").then(setSessions);
        }
      });
    }
    source.onerror = () => {
      setStreamStatus("error");
      source.close();
    };
  }

  async function loadSessionDetail(id: string) {
    const detail = await getJson<SessionDetail>(`/api/codex-console/session?id=${encodeURIComponent(id)}`);
    const events = await getJson<StreamEvent[]>(`/api/codex-console/session-events?id=${encodeURIComponent(id)}`);
    setSessionDetail(detail);
    setStreamEvents(events);
    if (isPlanExec(detail)) {
      setPlanExec(detail);
      setDryRun(detail.dryRun);
      setContextQuality(detail.dryRun.context.quality);
      return;
    }
    setDryRun(detail);
    setContextQuality(detail.context.quality);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void runAction("refresh", refresh, "Studio refreshed.");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        void runAction("plan-exec-stream", runPlanExecStream, "Plan Exec Stream started.");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runAction("dry-run", runDryRun, "Dry Run completed.");
        return;
      }
      if (!isEditable && event.key === "/") {
        event.preventDefault();
        graphSearchRef.current?.focus();
        return;
      }
      if (!isEditable && event.key === "?") {
        event.preventDefault();
        toggleHelp();
        return;
      }
      if (event.key === "Escape") {
        dismissToasts();
        if (helpOpen) {
          setHelpOpen(false);
          updatePreferences({ helpOpen: false });
        } else {
          setSelectedObject("");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [graphSeeds, graphFilters, helpOpen, prompt]);

  return (
    <>
      <header>
        <div>
          <h1>Repository Intelligence Studio</h1>
          <p>Interactive Graph Explorer · Knowledge Engine Trace · Codex Observability</p>
        </div>
        <div class="header-actions">
          <button onClick={() => toggleHelp()}>Help</button>
          <button disabled={isBusy} onClick={() => void runAction("refresh", refresh, "Studio refreshed.")}>
            {activeActions.includes("refresh") ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      {helpOpen && <HelpPanel onClose={toggleHelp} />}
      <main>
        <aside class="panel explorer">
          <h2>Repository Explorer</h2>
          {tree === undefined ? (
            <EmptyState title="Loading repository" message="Repository tree will appear after refresh completes." />
          ) : tree.children.length === 0 ? (
            <EmptyState title="No repository objects" message="Run knowledge build or refresh the Studio snapshot." />
          ) : (
            <RepositoryExplorer
              node={tree}
              onSelect={(id) => void runAction("select-object", () => selectObject(id))}
            />
          )}
        </aside>
        <section class="panel graph-panel">
          <GraphExplorer
            graph={graph}
            filters={graphFilters}
            seeds={graphSeeds}
            selectedId={selectedObjectId}
            onSelect={setSelectedObject}
            onExpand={(id) => void runAction("graph-expand", () => addGraphSeed(id), "Graph expanded.")}
            onApply={(filters) =>
              void runAction("graph-apply", () => applyGraph(graphSeeds, filters), "Graph filters applied.")
            }
            onReset={() => void runAction("graph-reset", resetGraph, "Graph reset.")}
            searchRef={graphSearchRef}
            busy={isBusy}
          />
        </section>
        <aside class={inspectorCollapsed ? "panel inspector collapsed" : "panel inspector"}>
          <div class="panel-title">
            <h2>Inspector</h2>
            <button onClick={() => toggleInspector()}>{inspectorCollapsed ? "Expand" : "Collapse"}</button>
          </div>
          {!inspectorCollapsed && (
            <>
              <GraphInspector
                detail={selectedDetail}
                selectedObjectId={selectedObjectId}
                setSelectedObjectId={setSelectedObject}
                analyzeImpact={() => void runAction("impact", analyzeImpact, "Impact analyzed.")}
                buildContext={() =>
                  void runAction("context-selected", buildContextForSelected, "Selected context built.")
                }
              />
              <section>
                <h2>Context Builder</h2>
                <textarea
                  rows={3}
                  value={contextQuery}
                  onInput={(event) => setContextQueryValue(event.currentTarget.value)}
                />
                <button disabled={isBusy} onClick={() => void runAction("context", buildContext, "Context built.")}>
                  {activeActions.includes("context") ? "Building..." : "Build Context"}
                </button>
                <pre>{contextOutput}</pre>
                <ContextQualityPanel quality={contextQuality} />
              </section>
              <section>
                <h2>Impact Analyzer</h2>
                <input
                  value={selectedObjectId}
                  onInput={(event) => setSelectedObject(event.currentTarget.value)}
                  placeholder="object id"
                />
                <button
                  disabled={isBusy || selectedObjectId.length === 0}
                  onClick={() => void runAction("impact", analyzeImpact, "Impact analyzed.")}
                >
                  {activeActions.includes("impact") ? "Analyzing..." : "Analyze"}
                </button>
                <pre>{impactOutput}</pre>
              </section>
              <KnowledgeDashboard dashboard={dashboard} />
            </>
          )}
        </aside>
        <section class="panel console">
          <CodexConsole
            prompt={prompt}
            setPrompt={setPromptValue}
            dryRun={dryRun}
            sessions={sessions}
            runDryRun={() => runAction("dry-run", runDryRun, "Dry Run completed.")}
            runPlanExec={() => runAction("plan-exec", runPlanExec, "Plan Exec completed.")}
            planExec={planExec}
            sessionDetail={sessionDetail}
            loadSessionDetail={(id) => runAction("session-detail", () => loadSessionDetail(id))}
            runPlanExecStream={() => runAction("plan-exec-stream", runPlanExecStream, "Plan Exec Stream started.")}
            streamEvents={streamEvents}
            streamStatus={streamStatus}
            busy={isBusy}
            activeActions={activeActions}
          />
        </section>
      </main>
    </>
  );
}

function ToastStack(props: { toasts: Toast[]; onDismiss(id: string): void }) {
  if (props.toasts.length === 0) return null;
  return (
    <div class="toast-stack" role="status" aria-live="polite">
      {props.toasts.map((toast) => (
        <button class={`toast ${toast.kind}`} key={toast.id} onClick={() => props.onDismiss(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  );
}

function EmptyState(props: { title: string; message: string }) {
  return (
    <div class="empty-state">
      <strong>{props.title}</strong>
      <span>{props.message}</span>
    </div>
  );
}

function HelpPanel(props: { onClose(): void }) {
  return (
    <div class="help-backdrop" onClick={() => props.onClose()}>
      <section class="help-panel" onClick={(event) => event.stopPropagation()}>
        <div class="panel-title">
          <h2>Studio Help</h2>
          <button onClick={() => props.onClose()}>Close</button>
        </div>
        <p>Repository Intelligence Studio 展示 Knowledge Engine 如何选择上下文、分析影响并驱动 Codex 只读执行。</p>
        <div class="help-grid">
          <article>
            <h3>Explorer</h3>
            <p>浏览仓库对象，点击文件或符号作为 graph seed。</p>
          </article>
          <article>
            <h3>Graph</h3>
            <p>搜索、过滤、拖拽和双击扩展知识图谱。</p>
          </article>
          <article>
            <h3>Context</h3>
            <p>构建上下文并查看质量评分、缺口和建议。</p>
          </article>
          <article>
            <h3>Impact</h3>
            <p>围绕选中对象查看影响范围。</p>
          </article>
          <article>
            <h3>Console</h3>
            <p>Dry Run 和 Plan Exec 展示 Codex 将使用的上下文与执行观测。</p>
          </article>
          <article>
            <h3>Safety</h3>
            <p>Plan Exec 保持只读 prompt + Git guard；点击执行才会调用真实 Codex。</p>
          </article>
        </div>
        <h3>Shortcuts</h3>
        <ul class="shortcut-list">
          <li>
            <kbd>Ctrl/Cmd</kbd> + <kbd>R</kbd> Refresh
          </li>
          <li>
            <kbd>Ctrl/Cmd</kbd> + <kbd>Enter</kbd> Dry Run
          </li>
          <li>
            <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> Plan Exec Stream
          </li>
          <li>
            <kbd>/</kbd> Focus graph search
          </li>
          <li>
            <kbd>?</kbd> Toggle help
          </li>
          <li>
            <kbd>Esc</kbd> Close help/toasts or clear selection
          </li>
        </ul>
      </section>
    </div>
  );
}

function RepositoryExplorer(props: { node: TreeNode; onSelect: (id: string) => void }) {
  return <TreeBranch node={props.node} onSelect={props.onSelect} />;
}

function TreeBranch(props: { node: TreeNode; onSelect: (id: string) => void }) {
  return (
    <ul class="tree">
      <li
        class={props.node.kind}
        title={props.node.objectIds.join("\n")}
        onClick={(event) => {
          event.stopPropagation();
          const id = props.node.objectIds[0];
          if (id !== undefined) props.onSelect(id);
        }}
      >
        {props.node.kind === "directory" ? "▸" : "•"} {props.node.name}
        {props.node.children.map((child) => (
          <TreeBranch key={child.path} node={child} onSelect={props.onSelect} />
        ))}
      </li>
    </ul>
  );
}

function GraphExplorer(props: {
  graph: GraphData;
  filters: GraphFilters;
  seeds: string[];
  selectedId: string;
  onSelect(id: string): void;
  onExpand(id: string): void;
  onApply(filters: GraphFilters): void;
  onReset(): void;
  searchRef: { current: HTMLInputElement | null };
  busy: boolean;
}) {
  const [draft, setDraft] = useState(props.filters);
  useEffect(() => setDraft(props.filters), [props.filters]);
  return (
    <>
      <div class="panel-title graph-title">
        <div>
          <h2>Interactive Knowledge Graph</h2>
          <span>
            {props.graph.nodes.length} nodes / {props.graph.edges.length} edges · seeds {props.seeds.length}
          </span>
        </div>
        <button disabled={props.busy} onClick={() => props.onReset()}>
          Reset
        </button>
      </div>
      <div class="graph-controls">
        <input
          ref={props.searchRef}
          value={draft.query}
          placeholder="Search id / label / path"
          onInput={(event) => setDraft({ ...draft, query: event.currentTarget.value })}
        />
        <label>
          Depth
          <input
            type="number"
            min={0}
            max={5}
            value={draft.depth}
            onInput={(event) => setDraft({ ...draft, depth: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          Limit
          <input
            type="number"
            min={1}
            max={500}
            value={draft.limit}
            onInput={(event) => setDraft({ ...draft, limit: Number(event.currentTarget.value) })}
          />
        </label>
        <button disabled={props.busy} onClick={() => props.onApply(draft)}>
          Apply
        </button>
      </div>
      <FilterChips
        title="Node Types"
        values={nodeTypeOptions}
        selected={draft.nodeTypes}
        onChange={(nodeTypes) => setDraft({ ...draft, nodeTypes })}
      />
      <FilterChips
        title="Edge Types"
        values={edgeTypeOptions}
        selected={draft.edgeTypes}
        onChange={(edgeTypes) => setDraft({ ...draft, edgeTypes })}
      />
      <D3Graph
        graph={props.graph}
        selectedId={props.selectedId}
        onSelect={(id) => props.onSelect(id)}
        onExpand={(id) => props.onExpand(id)}
      />
    </>
  );
}

function FilterChips(props: { title: string; values: string[]; selected: string[]; onChange(values: string[]): void }) {
  const selected = new Set(props.selected);
  return (
    <div class="chips" aria-label={props.title}>
      <strong>{props.title}</strong>
      {props.values.map((value) => (
        <button
          class={selected.has(value) ? "chip active" : "chip"}
          key={value}
          onClick={() => {
            const next = new Set(selected);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            props.onChange([...next]);
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

type SimNode = GraphNode & SimulationNodeDatum;
type SimEdge = GraphEdge & { source: SimNode | string; target: SimNode | string };

function D3Graph(props: {
  graph: GraphData;
  selectedId: string;
  onSelect(id: string): void;
  onExpand(id: string): void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const width = element.clientWidth || 900;
    const height = element.clientHeight || 560;
    const nodes: SimNode[] = props.graph.nodes.map((node) => ({ ...node }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links: SimEdge[] = props.graph.edges
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge) => ({ ...edge, source: edge.from, target: edge.to }));
    const svg = select(element);
    svg.selectAll("*").remove();
    const root = svg.append("g").attr("class", "graph-root");
    svg.call(
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
          root.attr("transform", event.transform.toString());
        }),
    );
    root
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "edge")
      .append("title")
      .text((edge) => `${edge.type}: ${edge.from} -> ${edge.to}`);
    const linkLines = root.select<SVGGElement>(".links").selectAll<SVGLineElement, SimEdge>("line");
    const node = root
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", (item) => (item.id === props.selectedId ? "graph-node selected" : "graph-node"))
      .on("click", (_event, item) => props.onSelect(item.id))
      .on("dblclick", (_event, item) => props.onExpand(item.id));
    node
      .append("circle")
      .attr("r", (item) => nodeRadius(item.type))
      .attr("class", (item) => `node ${nodeClass(item.type)}`);
    node
      .append("text")
      .attr("class", "label")
      .attr("x", 10)
      .attr("y", 4)
      .text((item) => item.label.slice(0, 36));
    node.append("title").text((item) => `${item.type}\n${item.id}\n${item.path ?? ""}`);
    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimEdge>(links)
          .id((item) => item.id)
          .distance(82),
      )
      .force("charge", forceManyBody().strength(-280))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((item) => nodeRadius(item.type) + 18),
      );
    const dragBehavior = drag<SVGGElement, SimNode>()
      .on("start", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, item) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        item.fx = item.x;
        item.fy = item.y;
      })
      .on("drag", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, item) => {
        item.fx = event.x;
        item.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, item) => {
        if (!event.active) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
      });
    node.call(dragBehavior);
    simulation.on("tick", () => {
      linkLines
        .attr("x1", (edge) => nodeX(edge.source))
        .attr("y1", (edge) => nodeY(edge.source))
        .attr("x2", (edge) => nodeX(edge.target))
        .attr("y2", (edge) => nodeY(edge.target));
      node.attr("transform", (item) => `translate(${item.x ?? width / 2},${item.y ?? height / 2})`);
    });
    return () => simulation.stop();
  }, [props.graph, props.selectedId]);
  return <svg ref={ref} class="graph" role="img" aria-label="Interactive knowledge graph" />;
}

function GraphInspector(props: {
  detail: GraphNodeDetail | undefined;
  selectedObjectId: string;
  setSelectedObjectId(id: string): void;
  analyzeImpact(): void;
  buildContext(): void;
}) {
  return (
    <section>
      <h2>Graph Inspector</h2>
      <input
        value={props.selectedObjectId}
        onInput={(event) => props.setSelectedObjectId(event.currentTarget.value)}
        placeholder="object id"
      />
      {props.detail === undefined ? (
        <p>选择一个节点查看类型、路径、metadata 与入/出边。</p>
      ) : (
        <div class="node-detail">
          <strong>{props.detail.node.label}</strong>
          <code>{props.detail.node.id}</code>
          <span>{props.detail.node.type}</span>
          <span>{props.detail.node.path ?? "no path"}</span>
          <span>
            incoming {props.detail.incoming.length} / outgoing {props.detail.outgoing.length}
          </span>
          <pre>{JSON.stringify(props.detail.node.metadata ?? {}, null, 2)}</pre>
        </div>
      )}
      <div class="inspector-actions">
        <button onClick={() => props.analyzeImpact()}>Analyze Impact</button>
        <button onClick={() => props.buildContext()}>Build Context</button>
      </div>
    </section>
  );
}

function ContextQualityPanel(props: { quality: ContextQuality | undefined }) {
  if (props.quality === undefined) return <p>运行 Context Builder 或 Dry Run 后展示上下文质量。</p>;
  return (
    <div class="quality-panel">
      <div class="quality-score">
        <strong>{props.quality.score}</strong>
        <span>{props.quality.grade}</span>
      </div>
      <h3>Metrics</h3>
      <div class="quality-metrics">
        {Object.entries(props.quality.metrics).map(([key, value]) => (
          <div class="quality-metric" key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <h3>Gaps</h3>
      <ul class="quality-list">
        {props.quality.gaps.length === 0 ? (
          <li>无明显缺口</li>
        ) : (
          props.quality.gaps.map((gap) => (
            <li key={gap.code}>
              [{gap.severity}] {gap.message}
            </li>
          ))
        )}
      </ul>
      <h3>Recommendations</h3>
      <ul class="quality-list">
        {props.quality.recommendations.map((item) => (
          <li key={`${item.action}-${item.title}`}>
            {item.title} · {item.confidence}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeDashboard(props: { dashboard: Dashboard | undefined }) {
  const dashboard = props.dashboard;
  const cards =
    dashboard === undefined
      ? []
      : [
          ["Objects", dashboard.objects],
          ["Nodes", dashboard.nodes],
          ["Edges", dashboard.edges],
          ["Orphans", dashboard.orphanNodes],
          ["Broken", dashboard.brokenEdges],
          ["Coverage", `${Math.round(dashboard.contextCoverage * 100)}%`],
          [
            "Quality",
            dashboard.contextQuality === undefined
              ? "n/a"
              : `${dashboard.contextQuality.score} ${dashboard.contextQuality.grade}`,
          ],
          ["Gaps", dashboard.contextQuality?.gaps ?? "n/a"],
          ["Recs", dashboard.contextQuality?.recommendations ?? "n/a"],
        ];
  return (
    <section>
      <h2>Knowledge Dashboard</h2>
      <div class="metrics">
        {cards.map(([label, value]) => (
          <div class="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CodexConsole(props: {
  prompt: string;
  setPrompt(value: string): void;
  dryRun: DryRun | undefined;
  planExec: PlanExec | undefined;
  sessionDetail: SessionDetail | undefined;
  sessions: SessionSummary[];
  runDryRun(): Promise<void>;
  runPlanExec(): Promise<void>;
  loadSessionDetail(id: string): Promise<void>;
  runPlanExecStream(): Promise<void>;
  streamEvents: StreamEvent[];
  streamStatus: string;
  busy: boolean;
  activeActions: string[];
}) {
  return (
    <>
      <h2>Codex Console · Dry Run / Plan Exec</h2>
      <div class="console-input">
        <input value={props.prompt} onInput={(event) => props.setPrompt(event.currentTarget.value)} />
        <button disabled={props.busy} onClick={() => void props.runDryRun()}>
          {props.activeActions.includes("dry-run") ? "Running..." : "Run Dry Run"}
        </button>
        <button disabled={props.busy} onClick={() => void props.runPlanExec()}>
          {props.activeActions.includes("plan-exec") ? "Running..." : "Run Plan Exec"}
        </button>
        <button disabled={props.busy} onClick={() => void props.runPlanExecStream()}>
          {props.activeActions.includes("plan-exec-stream") ? "Starting..." : "Run Plan Exec Stream"}
        </button>
      </div>
      {props.dryRun === undefined ? (
        <p>运行 dry run 或 plan exec 后会展示知识引擎 trace、prompt bundle 与真实 Codex 只读执行结果。</p>
      ) : (
        <DryRunViewer dryRun={props.dryRun} />
      )}
      {props.planExec !== undefined && <PlanExecViewer planExec={props.planExec} />}
      <StreamViewer events={props.streamEvents} status={props.streamStatus} />
      {props.sessionDetail !== undefined && <SessionDetailViewer detail={props.sessionDetail} />}
      <h2>Recent Sessions</h2>
      {props.sessions.length === 0 ? (
        <EmptyState title="No sessions" message="Dry Run and Plan Exec sessions will appear here." />
      ) : (
        <div class="sessions">
          {props.sessions.map((session) => (
            <article class="session" key={session.id} onClick={() => void props.loadSessionDetail(session.id)}>
              <strong>
                {session.kind ?? "dry-run"} · {session.intent}
              </strong>
              <span>{session.prompt}</span>
              <code>
                {session.bundleHash.slice(0, 12)}
                {session.exitCode === undefined ? "" : ` · exit ${session.exitCode}`}
              </code>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function DryRunViewer(props: { dryRun: DryRun }) {
  return (
    <div class="dry-run-grid">
      <div>
        <h3>Trace Timeline</h3>
        <div class="trace">
          {props.dryRun.trace.map((step) => (
            <article class="trace-step" key={step.name}>
              <h3>
                {step.name} · {step.durationMs}ms
              </h3>
              <pre>{JSON.stringify(step.output, null, 2)}</pre>
            </article>
          ))}
        </div>
      </div>
      <div>
        <h3>Prompt Bundle · {props.dryRun.promptBundle.hash.slice(0, 12)}</h3>
        <pre class="bundle">{props.dryRun.promptBundle.markdown}</pre>
      </div>
    </div>
  );
}

function PlanExecViewer(props: { planExec: PlanExec }) {
  return (
    <div class="plan-exec">
      <h3>Plan Exec Result</h3>
      <div class="metrics">
        <div class="metric">
          <span>Guard</span>
          <strong>{props.planExec.guardResult.ok ? "OK" : "FAIL"}</strong>
        </div>
        <div class="metric">
          <span>Command</span>
          <strong>{props.planExec.guardResult.command}</strong>
        </div>
        <div class="metric">
          <span>Exit</span>
          <strong>{props.planExec.execResult.exitCode ?? "null"}</strong>
        </div>
        <div class="metric">
          <span>Duration</span>
          <strong>{props.planExec.execResult.durationMs}ms</strong>
        </div>
      </div>
      <h3>Git Guard</h3>
      <pre class="bundle">
        {props.planExec.guardResult.git.changedFiles.length === 0
          ? "No workspace changes detected."
          : props.planExec.guardResult.git.changedFiles.join("\n")}
      </pre>
      <h3>stdout</h3>
      <pre class="bundle">{props.planExec.execResult.stdout || "(empty)"}</pre>
      <h3>stderr</h3>
      <pre class="bundle">{props.planExec.execResult.stderr || "(empty)"}</pre>
    </div>
  );
}

function parseStreamEvent(event: Event): StreamEvent | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return undefined;
  const value = JSON.parse(event.data) as unknown;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.timestamp !== "string" || typeof record.type !== "string") return undefined;
  return { timestamp: record.timestamp, type: record.type, payload: record.payload };
}

function StreamViewer(props: { events: StreamEvent[]; status: string }) {
  const stdout = props.events
    .filter((item) => item.type === "stdout")
    .map((item) => (item.payload as { chunk?: string }).chunk ?? "")
    .join("");
  const stderr = props.events
    .filter((item) => item.type === "stderr")
    .map((item) => (item.payload as { chunk?: string }).chunk ?? "")
    .join("");
  if (props.events.length === 0 && props.status === "idle")
    return <EmptyState title="No stream events" message="Run Plan Exec Stream to observe live events." />;
  return (
    <div class="plan-exec">
      <h3>Streaming Plan Exec · {props.status}</h3>
      <div class="trace">
        {props.events.map((item, index) => (
          <article class="trace-step" key={`${item.timestamp}-${index}`}>
            <h3>{item.type}</h3>
            <pre>{JSON.stringify(item.payload, null, 2)}</pre>
          </article>
        ))}
      </div>
      <h3>stream stdout</h3>
      <pre class="bundle">{stdout || "(empty)"}</pre>
      <h3>stream stderr</h3>
      <pre class="bundle">{stderr || "(empty)"}</pre>
    </div>
  );
}

function SessionDetailViewer(props: { detail: SessionDetail }) {
  if (isPlanExec(props.detail)) {
    return (
      <div class="plan-exec">
        <h3>Session Replay · Plan Exec</h3>
        <PlanExecViewer planExec={props.detail} />
      </div>
    );
  }
  return (
    <div class="plan-exec">
      <h3>Session Replay · Dry Run</h3>
      <DryRunViewer dryRun={props.detail} />
    </div>
  );
}

function isPlanExec(detail: SessionDetail): detail is PlanExec {
  return "execResult" in detail;
}

async function loadGraph(seeds: string[], filters: GraphFilters): Promise<GraphData> {
  const params = new URLSearchParams();
  for (const seed of seeds) params.append("seed", seed);
  params.set("depth", String(filters.depth));
  params.set("limit", String(filters.limit));
  if (filters.query.trim().length > 0) params.set("q", filters.query.trim());
  for (const nodeType of filters.nodeTypes) params.append("nodeType", nodeType);
  for (const edgeType of filters.edgeTypes) params.append("edgeType", edgeType);
  return await getJson<GraphData>(`/api/graph?${params.toString()}`);
}

function graphDetail(graph: GraphData, id: string): GraphNodeDetail | undefined {
  const node = graph.nodes.find((item) => item.id === id);
  if (node === undefined) return undefined;
  return {
    node,
    incoming: graph.edges.filter((edge) => edge.to === id),
    outgoing: graph.edges.filter((edge) => edge.from === id),
  };
}

function nodeRadius(type: string): number {
  if (type === "Directory" || type === "Project") return 11;
  if (type === "CodeSymbol") return 6;
  return 8;
}

function nodeClass(type: string): string {
  return type.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

function nodeX(value: SimNode | string): number {
  return typeof value === "string" ? 0 : (value.x ?? 0);
}

function nodeY(value: SimNode | string): number {
  return typeof value === "string" ? 0 : (value.y ?? 0);
}

function readStudioPreferences(): StudioPreferences {
  try {
    const raw = localStorage.getItem(preferencesKey);
    if (raw === null) return defaultPreferences;
    const value = JSON.parse(raw) as Partial<StudioPreferences>;
    return {
      ...defaultPreferences,
      ...value,
      graphFilters: { ...defaultFilters, ...(value.graphFilters ?? {}) },
      graphSeeds: Array.isArray(value.graphSeeds)
        ? value.graphSeeds.filter((item): item is string => typeof item === "string")
        : [],
      selectedObjectId: typeof value.selectedObjectId === "string" ? value.selectedObjectId : "",
      contextQuery: typeof value.contextQuery === "string" ? value.contextQuery : defaultPreferences.contextQuery,
      prompt: typeof value.prompt === "string" ? value.prompt : defaultPreferences.prompt,
      helpOpen: typeof value.helpOpen === "boolean" ? value.helpOpen : false,
      inspectorCollapsed: typeof value.inspectorCollapsed === "boolean" ? value.inspectorCollapsed : false,
    };
  } catch {
    return defaultPreferences;
  }
}

function writeStudioPreferences(preferences: StudioPreferences): void {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  } catch {
    // Ignore browser storage failures.
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

const app = document.querySelector("#app");
if (app === null) throw new Error("Missing #app root.");
render(<App />, app);

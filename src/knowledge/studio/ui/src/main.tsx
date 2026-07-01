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

function App() {
  const [tree, setTree] = useState<TreeNode | undefined>();
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [dashboard, setDashboard] = useState<Dashboard | undefined>();
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [graphSeeds, setGraphSeeds] = useState<string[]>([]);
  const [graphFilters, setGraphFilters] = useState<GraphFilters>(defaultFilters);
  const [contextQuery, setContextQuery] = useState("设计 Repository Intelligence Studio v2");
  const [contextOutput, setContextOutput] = useState("");
  const [contextQuality, setContextQuality] = useState<ContextQuality | undefined>();
  const [impactOutput, setImpactOutput] = useState("");
  const [prompt, setPrompt] = useState("请规划一个知识引擎驱动的 Codex 改动");
  const [dryRun, setDryRun] = useState<DryRun | undefined>();
  const [planExec, setPlanExec] = useState<PlanExec | undefined>();
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | undefined>();
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const selectedDetail = useMemo(() => graphDetail(graph, selectedObjectId), [graph, selectedObjectId]);

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
    setGraph(await loadGraph(nextSeeds, nextFilters));
  }

  async function selectObject(id: string) {
    setSelectedObjectId(id);
    await applyGraph([id], { ...graphFilters, depth: Math.max(graphFilters.depth, 2) });
  }

  async function addGraphSeed(id: string) {
    const nextSeeds = [...new Set([...graphSeeds, id])];
    setSelectedObjectId(id);
    await applyGraph(nextSeeds, graphFilters);
  }

  async function resetGraph() {
    setSelectedObjectId("");
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

  return (
    <>
      <header>
        <div>
          <h1>Repository Intelligence Studio</h1>
          <p>Interactive Graph Explorer · Knowledge Engine Trace · Codex Observability</p>
        </div>
        <button onClick={() => void refresh()}>Refresh</button>
      </header>
      <main>
        <aside class="panel explorer">
          <h2>Repository Explorer</h2>
          {tree === undefined ? (
            <p>Loading...</p>
          ) : (
            <RepositoryExplorer node={tree} onSelect={(id) => void selectObject(id)} />
          )}
        </aside>
        <section class="panel graph-panel">
          <GraphExplorer
            graph={graph}
            filters={graphFilters}
            seeds={graphSeeds}
            selectedId={selectedObjectId}
            onSelect={setSelectedObjectId}
            onExpand={(id) => void addGraphSeed(id)}
            onApply={(filters) => void applyGraph(graphSeeds, filters)}
            onReset={() => void resetGraph()}
          />
        </section>
        <aside class="panel inspector">
          <GraphInspector
            detail={selectedDetail}
            selectedObjectId={selectedObjectId}
            setSelectedObjectId={setSelectedObjectId}
            analyzeImpact={() => void analyzeImpact()}
            buildContext={() => void buildContextForSelected()}
          />
          <section>
            <h2>Context Builder</h2>
            <textarea rows={3} value={contextQuery} onInput={(event) => setContextQuery(event.currentTarget.value)} />
            <button onClick={() => void buildContext()}>Build Context</button>
            <pre>{contextOutput}</pre>
            <ContextQualityPanel quality={contextQuality} />
          </section>
          <section>
            <h2>Impact Analyzer</h2>
            <input
              value={selectedObjectId}
              onInput={(event) => setSelectedObjectId(event.currentTarget.value)}
              placeholder="object id"
            />
            <button onClick={() => void analyzeImpact()}>Analyze</button>
            <pre>{impactOutput}</pre>
          </section>
          <KnowledgeDashboard dashboard={dashboard} />
        </aside>
        <section class="panel console">
          <CodexConsole
            prompt={prompt}
            setPrompt={setPrompt}
            dryRun={dryRun}
            sessions={sessions}
            runDryRun={runDryRun}
            runPlanExec={runPlanExec}
            planExec={planExec}
            sessionDetail={sessionDetail}
            loadSessionDetail={loadSessionDetail}
            runPlanExecStream={runPlanExecStream}
            streamEvents={streamEvents}
            streamStatus={streamStatus}
          />
        </section>
      </main>
    </>
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
        <button onClick={() => props.onReset()}>Reset</button>
      </div>
      <div class="graph-controls">
        <input
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
        <button onClick={() => props.onApply(draft)}>Apply</button>
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
}) {
  return (
    <>
      <h2>Codex Console · Dry Run / Plan Exec</h2>
      <div class="console-input">
        <input value={props.prompt} onInput={(event) => props.setPrompt(event.currentTarget.value)} />
        <button onClick={() => void props.runDryRun()}>Run Dry Run</button>
        <button onClick={() => void props.runPlanExec()}>Run Plan Exec</button>
        <button onClick={() => void props.runPlanExecStream()}>Run Plan Exec Stream</button>
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
  if (props.events.length === 0 && props.status === "idle") return null;
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

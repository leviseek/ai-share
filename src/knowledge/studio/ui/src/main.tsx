import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
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

type Dashboard = {
  objects: number;
  nodes: number;
  edges: number;
  orphanNodes: number;
  brokenEdges: number;
  contextCoverage: number;
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
  context: { summary: string; objects: { id: string; type: string; path?: string }[]; diagnostics: string[] };
  impact: GraphData;
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

type SessionDetail = DryRun | PlanExec;

type StreamEvent = { timestamp: string; type: string; payload: unknown };

function App() {
  const [tree, setTree] = useState<TreeNode | undefined>();
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [dashboard, setDashboard] = useState<Dashboard | undefined>();
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [contextQuery, setContextQuery] = useState("设计 Repository Intelligence Studio v2");
  const [contextOutput, setContextOutput] = useState("");
  const [impactOutput, setImpactOutput] = useState("");
  const [prompt, setPrompt] = useState("请规划一个知识引擎驱动的 Codex 改动");
  const [dryRun, setDryRun] = useState<DryRun | undefined>();
  const [planExec, setPlanExec] = useState<PlanExec | undefined>();
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | undefined>();
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  async function refresh() {
    const [treeData, graphData, dashboardData, sessionData] = await Promise.all([
      getJson<TreeNode>("/api/repository/tree"),
      getJson<GraphData>("/api/graph"),
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

  async function selectObject(id: string) {
    setSelectedObjectId(id);
    setGraph(await getJson<GraphData>(`/api/graph?seed=${encodeURIComponent(id)}&depth=2`));
  }

  async function buildContext() {
    const result = await postJson<{
      summary: string;
      objects: { id: string; type: string; path?: string }[];
      diagnostics: string[];
      graph: GraphData;
    }>("/api/context", { query: contextQuery, intent: "plan", maxObjects: 30 });
    setContextOutput(
      JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics, objects: result.objects }, null, 2),
    );
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
    setGraph(result.impact.nodes.length > 0 ? result.impact : result.context === undefined ? graph : result.impact);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
    setSessions(await getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"));
  }

  async function runPlanExec() {
    const result = await postJson<PlanExec>("/api/codex-console/plan-exec", { prompt, maxObjects: 30 });
    setPlanExec(result);
    setSessionDetail(result);
    setDryRun(result.dryRun);
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
      return;
    }
    setDryRun(detail);
  }

  return (
    <>
      <header>
        <div>
          <h1>Repository Intelligence Studio</h1>
          <p>Codex Dry Run 可观察工作流 · Knowledge Engine Trace · Prompt Bundle</p>
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
          <div class="panel-title">
            <h2>Knowledge Graph</h2>
            <span>
              {graph.nodes.length} nodes / {graph.edges.length} edges
            </span>
          </div>
          <KnowledgeGraph graph={graph} onSelect={setSelectedObjectId} />
        </section>
        <aside class="panel inspector">
          <section>
            <h2>Context Builder</h2>
            <textarea rows={3} value={contextQuery} onInput={(event) => setContextQuery(event.currentTarget.value)} />
            <button onClick={() => void buildContext()}>Build Context</button>
            <pre>{contextOutput}</pre>
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

function KnowledgeGraph(props: { graph: GraphData; onSelect(id: string): void }) {
  const view = useMemo(() => layoutGraph(props.graph), [props.graph]);
  return (
    <svg class="graph" role="img" aria-label="Knowledge graph" viewBox="0 0 900 560">
      {view.edges.map((edge) => (
        <line key={edge.id} class="edge" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
      ))}
      {view.nodes.map((node) => (
        <g key={node.id} onClick={() => props.onSelect(node.id)}>
          <circle class="node" cx={node.x} cy={node.y} r={node.r} />
          <text class="label" x={node.x + 10} y={node.y + 4}>
            {node.label.slice(0, 32)}
          </text>
        </g>
      ))}
    </svg>
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

function layoutGraph(graph: GraphData) {
  const nodes = graph.nodes.slice(0, 90);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    const radius = 210;
    positions.set(node.id, { x: 450 + Math.cos(angle) * radius, y: 280 + Math.sin(angle) * radius });
  });
  const viewNodes = nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) ?? { x: 450, y: 280 }),
    r: node.type === "Directory" ? 9 : 7,
  }));
  const viewEdges = graph.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .slice(0, 180)
    .flatMap((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (from === undefined || to === undefined) return [];
      return [{ ...edge, x1: from.x, y1: from.y, x2: to.x, y2: to.y }];
    });
  return { nodes: viewNodes, edges: viewEdges };
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

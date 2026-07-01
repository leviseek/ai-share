const state = {
  graph: { nodes: [], edges: [] },
};

const tree = document.querySelector("#tree");
const graph = document.querySelector("#graph");
const graphCounts = document.querySelector("#graph-counts");
const dashboard = document.querySelector("#dashboard");
const contextOutput = document.querySelector("#context-output");
const impactOutput = document.querySelector("#impact-output");
const trace = document.querySelector("#trace");

document.querySelector("#refresh").addEventListener("click", () => loadAll());
document.querySelector("#build-context").addEventListener("click", () => buildContext());
document.querySelector("#analyze-impact").addEventListener("click", () => analyzeImpact());
document.querySelector("#run-codex").addEventListener("click", () => runCodexMock());

await loadAll();

async function loadAll() {
  const [treeData, graphData, dashboardData] = await Promise.all([
    getJson("/api/repository/tree"),
    getJson("/api/graph"),
    getJson("/api/dashboard"),
  ]);
  renderTree(treeData);
  renderGraph(graphData);
  renderDashboard(dashboardData);
}

async function buildContext() {
  const query = document.querySelector("#context-query").value;
  const result = await postJson("/api/context", { query, intent: "plan", maxObjects: 30 });
  contextOutput.textContent = JSON.stringify(
    {
      summary: result.summary,
      sections: result.sections,
      diagnostics: result.diagnostics,
      objects: result.objects.map((object) => ({ id: object.id, type: object.type, path: object.path })),
    },
    null,
    2,
  );
  renderGraph(result.graph);
  const dashboardData = await getJson("/api/dashboard");
  renderDashboard(dashboardData);
}

async function analyzeImpact() {
  const id = document.querySelector("#impact-id").value.trim();
  if (id.length === 0) return;
  const result = await getJson(`/api/impact?id=${encodeURIComponent(id)}`);
  impactOutput.textContent = JSON.stringify({ nodes: result.nodes.length, edges: result.edges.length }, null, 2);
  renderGraph(result);
}

async function runCodexMock() {
  const prompt = document.querySelector("#codex-prompt").value;
  const result = await postJson("/api/codex-console/mock", { prompt });
  trace.innerHTML = "";
  for (const step of result.steps) {
    const card = document.createElement("article");
    card.className = "trace-step";
    card.innerHTML = `<h3>${escapeHtml(step.name)} · ${step.durationMs}ms</h3><pre>${escapeHtml(JSON.stringify(step.output, null, 2))}</pre>`;
    trace.append(card);
  }
}

function renderTree(node) {
  tree.innerHTML = "";
  tree.append(renderTreeNode(node));
}

function renderTreeNode(node) {
  const ul = document.createElement("ul");
  const li = document.createElement("li");
  li.className = node.kind;
  li.textContent = `${node.kind === "directory" ? "▸" : "•"} ${node.name}`;
  li.title = node.objectIds.join("\n");
  li.addEventListener("click", (event) => {
    event.stopPropagation();
    const id = node.objectIds[0];
    if (id !== undefined) {
      document.querySelector("#impact-id").value = id;
      renderSeedGraph(id);
    }
  });
  ul.append(li);
  for (const child of node.children) li.append(renderTreeNode(child));
  return ul;
}

async function renderSeedGraph(id) {
  const result = await getJson(`/api/graph?seed=${encodeURIComponent(id)}&depth=2`);
  renderGraph(result);
}

function renderGraph(data) {
  state.graph = data;
  graphCounts.textContent = `${data.nodes.length} nodes / ${data.edges.length} edges`;
  graph.innerHTML = "";
  const width = graph.clientWidth || 800;
  const height = graph.clientHeight || 480;
  const nodes = data.nodes.slice(0, 80);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = data.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)).slice(0, 160);
  const positions = new Map();
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    const radius = Math.min(width, height) * 0.38;
    positions.set(node.id, {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    });
  });
  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const line = svg("line", { class: "edge", x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    graph.append(line);
  }
  for (const node of nodes) {
    const position = positions.get(node.id);
    if (position === undefined) continue;
    const group = svg("g", {});
    group.addEventListener("click", () => {
      document.querySelector("#impact-id").value = node.id;
    });
    group.append(svg("circle", { class: "node", cx: position.x, cy: position.y, r: 5 + typeWeight(node.type) }));
    group.append(svg("text", { class: "label", x: position.x + 9, y: position.y + 4 }, node.label.slice(0, 32)));
    graph.append(group);
  }
}

function renderDashboard(data) {
  const cards = [
    ["Objects", data.objects],
    ["Nodes", data.nodes],
    ["Edges", data.edges],
    ["Orphans", data.orphanNodes],
    ["Broken", data.brokenEdges],
    ["Coverage", `${Math.round(data.contextCoverage * 100)}%`],
  ];
  dashboard.innerHTML = cards
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

function svg(name, attributes, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function typeWeight(type) {
  if (type === "Directory") return 4;
  if (type === "CodeSymbol") return 2;
  return 1;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

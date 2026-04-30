export const clientScript: string = String.raw`
const panel = document.getElementById("panel");
const bar = document.getElementById("bar");
const collapse = document.getElementById("collapse");
let drag = null;
let collapsed = false;
let lastAgentsSignature = "";
let sortState = { key: "default", dir: "asc" };
const statusOrder = { running: 0, retry: 1, error: 2, idle: 3, unknown: 4 };

bar.addEventListener("mousedown", (event) => {
  if (event.target === collapse) return;
  const rect = panel.getBoundingClientRect();
  drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
});

window.addEventListener("mousemove", (event) => {
  if (!drag) return;
  panel.style.right = "auto";
  panel.style.left = Math.max(8, event.clientX - drag.x) + "px";
  panel.style.top = Math.max(8, event.clientY - drag.y) + "px";
});

window.addEventListener("mouseup", () => {
  drag = null;
});

collapse.addEventListener("click", () => {
  collapsed = !collapsed;
  document.body.classList.toggle("collapsed", collapsed);
  collapse.textContent = collapsed ? "展开" : "折叠";
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("th.sortable");
  if (!target) return;
  const key = target.dataset.sort;
  sortState = { key, dir: sortState.key === key ? (sortState.dir === "asc" ? "desc" : "asc") : defaultSortDir(key) };
  lastAgentsSignature = "";
  refresh();
});

function defaultSortDir(key) {
  return key === "executed" || key === "tokens" || key === "avg" ? "desc" : "asc";
}

function fmtMs(ms) {
  const sec = Math.max(Math.round(ms / 1000), 0);
  if (sec < 60) return sec + "s";
  const min = Math.floor(sec / 60);
  if (min < 60) return sec % 60 === 0 ? min + "m" : min + "m" + String(sec % 60).padStart(2, "0") + "s";
  const hour = Math.floor(min / 60);
  return min % 60 === 0 ? hour + "h" : hour + "h" + String(min % 60).padStart(2, "0") + "m";
}

function fmtToken(value) {
  const token = Number(value || 0);
  if (token < 1000) return String(token);
  if (token < 1000000) return trimFixed(token / 1000) + "K";
  return trimFixed(token / 1000000) + "M";
}

function trimFixed(value) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

function kindRank(kind) {
  if (kind === "main") return 0;
  if (kind === "subagent") return 1;
  if (kind === "category") return 2;
  return 3;
}

function sortedAgents(agents) {
  const direction = sortState.dir === "desc" ? -1 : 1;
  const pinned = agents.filter((agent) => agent.name === "main");
  const sortable = agents.filter((agent) => agent.name !== "main");
  const sorted = sortState.key === "default"
    ? sortable.sort(defaultCompare)
    : sortable.sort((left, right) => compareByKey(left, right, sortState.key) * direction || defaultCompare(left, right));
  return [...pinned, ...sorted];
}

function defaultCompare(left, right) {
  return ((statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99))
    || (kindRank(left.kind) - kindRank(right.kind))
    || ((right.totalTokens ?? 0) - (left.totalTokens ?? 0))
    || String(left.name).localeCompare(String(right.name));
}

function compareByKey(left, right, key) {
  if (key === "status") return (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
  if (key === "agent") return String(left.displayName).localeCompare(String(right.displayName));
  if (key === "executed") return (left.executed ?? 0) - (right.executed ?? 0);
  if (key === "tokens") return (left.totalTokens ?? 0) - (right.totalTokens ?? 0);
  if (key === "avg") return (left.avgMs ?? 0) - (right.avgMs ?? 0);
  return 0;
}

function statusText(status) {
  if (status === "running") return "运行中";
  if (status === "retry") return "重试";
  if (status === "error") return "异常";
  if (status === "idle") return "空闲";
  return "未知";
}

function kindText(agent) {
  const suffix = agent.background ? " · 后台" : "";
  if (agent.kind === "main") return "主Agent" + suffix;
  if (agent.kind === "subagent") return "子Agent" + suffix;
  if (agent.kind === "category") return "类别任务" + suffix;
  return "工具" + suffix;
}

function kindBadge(agent) {
  if (agent.kind === "main") return "【主】";
  if (agent.kind === "subagent") return agent.background ? "【子·后台】" : "【子】";
  if (agent.kind === "category") return "【类】";
  return "【工具】";
}

function kindClass(agent) {
  if (agent.kind === "main") return "kind-main";
  if (agent.kind === "subagent") return "kind-subagent";
  if (agent.kind === "category") return "kind-category";
  return "kind-tool";
}

function colorByStatus(status) {
  if (status === "running") return "running";
  if (status === "retry") return "retry";
  if (status === "error") return "error";
  if (status === "idle") return "idle";
  return "unknown";
}

function pct(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

async function refresh() {
  const response = await fetch("/state", { cache: "no-store" });
  const data = await response.json();

  const activeRatio = data.session.elapsedMs > 0 ? (data.session.activeMs / data.session.elapsedMs) * 100 : 0;
  const idleRatio = 100 - activeRatio;

  document.getElementById("kpi").innerHTML = [
    ["任务进度", data.todos.progress + "%"],
    ["总消耗 Token", String(data.session.totalTokens)],
    ["已执行时长", fmtMs(data.session.activeMs)],
    ["空闲持续", fmtMs(data.session.idleMs)],
  ].map(([label, value]) => '<div class="kpi"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>').join("");

  document.getElementById("taskProgress").style.width = pct(data.todos.progress) + "%";
  document.getElementById("taskSummary").textContent = "完成 " + data.todos.done + "/" + data.todos.total + "，待处理 " + data.todos.pending;
  document.getElementById("runningTodo").textContent = data.todos.inProgress.length > 0 ? "进行中：" + data.todos.inProgress.join(" / ") : "进行中：无";

  document.getElementById("activeProgress").style.width = pct(activeRatio) + "%";
  document.getElementById("timeSummary").textContent = "活跃占比 " + pct(activeRatio) + "%，空闲占比 " + pct(idleRatio) + "%";

  const body = document.getElementById("agentsBody");
  const agents = sortedAgents(data.agents);
  const agentsSignature = JSON.stringify([sortState, agents.map((agent) => [agent.status, agent.kind, agent.background, agent.name, agent.executed, agent.totalTokens, agent.avgMs])]);
  updateSortHeaders();
  if (agentsSignature !== lastAgentsSignature) {
    lastAgentsSignature = agentsSignature;
    body.innerHTML = agents.length === 0
      ? '<tr><td colspan="5">暂无 agent 执行记录</td></tr>'
      : agents.map((agent) => {
          const cls = colorByStatus(agent.status);
          return '<tr>' +
            '<td class="status ' + cls + '">' + statusText(agent.status) + '</td>' +
            '<td><span class="kindBadge ' + kindClass(agent) + '">' + kindBadge(agent) + '</span><span class="agentName">' + agent.displayName + '</span>' +
            '<br><span class="caption">' + kindText(agent) + (agent.name === "main" ? " · 内部名: main" : "") + (agent.parentAgent ? " · 父: " + agent.parentAgent : "") + '</span></td>' +
            '<td>' + agent.executed + '</td>' +
            '<td title="' + agent.totalTokens + '">' + fmtToken(agent.totalTokens) + '</td>' +
            '<td>' + fmtMs(agent.avgMs) + '</td>' +
          '</tr>';
        }).join("");
  }

  document.getElementById("footer").textContent = "会话状态：" + statusText(data.session.status) + " · 更新时间：" + new Date(data.updatedAt).toLocaleTimeString();
}

function updateSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((header) => {
    const label = header.dataset.label || header.textContent.replace(/[↑↓↕]/g, "").trim();
    header.dataset.label = label;
    if (sortState.key === "default") {
      header.textContent = header.dataset.sort === "status" ? label + " ↑" : label;
      return;
    }
    header.textContent = header.dataset.sort === sortState.key ? label + (sortState.dir === "asc" ? " ↑" : " ↓") : label;
  });
}

refresh();
setInterval(refresh, 1000);
`;

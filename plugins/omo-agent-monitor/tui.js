import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");
const statusRank = { running: 0, retry: 1, error: 2, idle: 3, unknown: 4 };
const defaultAgentNames = [
  "main",
  "build",
  "plan",
  "sisyphus",
  "hephaestus",
  "prometheus",
  "oracle",
  "momus",
  "metis",
  "atlas",
  "sisyphus-junior",
  "explorer",
  "librarian",
  "multimodal-looker",
  "ultrabrain",
  "deep",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "visual-engineering",
  "artistry",
];

let webServer;
let webPort = 0;

const plugin = {
  id: "omo-agent-monitor",
  tui: async (api) => {
    api.command.register(() => [
      {
        title: "OMO agents monitor (WebUI)",
        value: "omo.agent.monitor.webui",
        description: "打开 OMO 编排状态 WebUI 浮窗",
        category: "OMO",
        slash: { name: "omo-monitor", aliases: ["omom"] },
        onSelect: async () => {
          const url = await ensureWebUi();
          openBrowser(url);
        },
      },
    ]);
  },
};

async function ensureWebUi() {
  if (webServer && webPort > 0) return `http://127.0.0.1:${webPort}`;

  await new Promise((resolveReady, rejectReady) => {
    webServer = createServer((request, response) => {
      const url = request.url ?? "/";
      if (url === "/state") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify(buildViewModel()));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(renderHtml());
    });

    webServer.once("error", rejectReady);
    webServer.listen(0, "127.0.0.1", () => {
      const address = webServer.address();
      if (typeof address === "object" && address?.port) {
        webPort = address.port;
        resolveReady(undefined);
        return;
      }
      rejectReady(new Error("无法获取 OMO monitor WebUI 端口"));
    });
  });

  return `http://127.0.0.1:${webPort}`;
}

function openBrowser(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }
  if (process.platform === "darwin") {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

function buildViewModel() {
  const state = loadMonitorState();
  const todos = Array.isArray(state.todos) ? state.todos : [];
  const done = todos.filter((todo) => todo.status === "completed").length;
  const inProgress = todos.filter((todo) => todo.status === "in_progress");
  const pending = todos.filter((todo) => todo.status === "pending");
  const progress = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;
  const now = Date.now();
  const agents = mergeAgents(Array.isArray(state.agents) ? state.agents : []);
  const startedAt = state.session?.startedAt ?? now;
  const activeMs = Math.max(state.session?.totalActiveMs ?? 0, 0);
  const elapsedMs = Math.max(now - startedAt, 0);
  const idleMs = Math.max(elapsedMs - activeMs, 0);

  return {
    updatedAt: state.updatedAt ?? now,
    session: {
      status: state.session?.status ?? "idle",
      startedAt,
      elapsedMs,
      activeMs,
      idleMs,
      totalTokens: state.session?.totalTokens ?? 0,
    },
    todos: {
      total: todos.length,
      done,
      inProgress: inProgress.map((todo) => todo.content),
      pending: pending.length,
      progress,
    },
    agents: agents.map((agent) => {
      const executed = Number(agent.executed ?? 0);
      const totalMs = Number(agent.totalMs ?? 0);
      const status = agent.name === "main" && agent.status === "unknown" ? "idle" : agent.status;
      return {
        name: agent.name,
        displayName: displayAgentName(agent),
        kind: typeof agent.kind === "string" ? agent.kind : "tool",
        source: typeof agent.source === "string" ? agent.source : "fallback",
        background: Boolean(agent.background),
        parentAgent: typeof agent.parentAgent === "string" ? agent.parentAgent : "",
        status,
        executed,
        totalTokens: Number(agent.totalTokens ?? 0),
        avgMs: executed > 0 ? Math.round(totalMs / executed) : 0,
        currentOperation: typeof agent.currentOperation === "string" ? agent.currentOperation : "",
      };
    }),
  };
}

function mergeAgents(agents) {
  const seen = new Set(agents.map((agent) => agent.name).filter((name) => typeof name === "string" && name.length > 0));
  return [
    ...agents,
    ...defaultAgentNames
      .filter((name) => !seen.has(name))
      .map((name) => ({
        name,
        kind: defaultAgentKind(name),
        source: "fallback",
        background: false,
        status: "idle",
        executed: 0,
        totalMs: 0,
        totalTokens: 0,
        currentOperation: "-",
      })),
  ];
}

function defaultAgentKind(name) {
  if (name === "main" || name === "build" || name === "plan") return "main";
  if (
    [
      "ultrabrain",
      "deep",
      "quick",
      "unspecified-low",
      "unspecified-high",
      "writing",
      "visual-engineering",
      "artistry",
    ].includes(name)
  ) {
    return "category";
  }
  return "subagent";
}

function displayAgentName(agent) {
  return agent.name === "main" ? "Hephaestus（主入口）" : agent.name;
}

function loadMonitorState() {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function renderHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OMO Monitor WebUI</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: rgba(17, 20, 28, 0.85);
      --card: rgba(28, 32, 44, 0.85);
      --line: rgba(255, 255, 255, 0.15);
      --text: #eaf2ff;
      --sub: #8ea3c7;
      --ok: #22c55e;
      --run: #3b82f6;
      --warn: #f59e0b;
      --err: #ef4444;
      --idle: #94a3b8;
      --unknown: #64748b;
    }
    html, body { margin: 0; padding: 0; font-family: "Segoe UI", "PingFang SC", sans-serif; color: var(--text); background: radial-gradient(circle at 30% -20%, #1f2a44 0%, #0a0d14 55%); }
    #panel { position: fixed; top: 18px; right: 18px; width: 720px; max-width: calc(100vw - 36px); background: var(--bg); border: 1px solid var(--line); backdrop-filter: blur(14px); border-radius: 14px; box-shadow: 0 18px 44px rgba(0,0,0,0.45); overflow: hidden; }
    #bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: move; background: linear-gradient(120deg, rgba(59,130,246,0.15), rgba(34,197,94,0.1)); border-bottom: 1px solid var(--line); user-select: none; }
    #title { font-weight: 700; letter-spacing: 0.2px; }
    #collapse { border: 1px solid var(--line); background: transparent; color: var(--text); border-radius: 8px; padding: 4px 8px; cursor: pointer; }
    #content { padding: 12px 14px 14px; }
    .grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; margin-bottom: 12px; }
    .kpi { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
    .kpi .label { color: var(--sub); font-size: 12px; }
    .kpi .value { margin-top: 3px; font-size: 17px; font-weight: 700; }
    .row { margin-bottom: 12px; }
    .caption { color: var(--sub); font-size: 12px; margin-bottom: 6px; }
    .bar { width: 100%; height: 12px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; border: 1px solid var(--line); }
    .fill { height: 100%; transition: width .25s; }
    .tasks { display: flex; gap: 12px; color: var(--sub); font-size: 12px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; }
    th { color: var(--sub); font-weight: 500; }
    th.sortable { cursor: pointer; user-select: none; }
    th.sortable:hover { color: var(--text); }
    .status { font-weight: 700; }
    .agentName { font-weight: 700; }
    .kindBadge { margin-right: 6px; font-weight: 800; letter-spacing: .2px; }
    .kind-main { color: #facc15; }
    .kind-subagent { color: #60a5fa; }
    .kind-category { color: #34d399; }
    .kind-tool { color: #c084fc; }
    .running { color: var(--run); }
    .retry { color: var(--warn); }
    .error { color: var(--err); }
    .idle { color: var(--idle); }
    .unknown { color: var(--unknown); }
    .inprogress { margin-top: 8px; color: #c7d7f8; font-size: 13px; }
    #footer { margin-top: 8px; color: var(--sub); font-size: 12px; }
    .collapsed #content { display: none; }
    .collapsed #panel { width: 420px; }
  </style>
</head>
<body>
  <div id="panel">
    <div id="bar">
      <div id="title">OMO Monitor · WebUI</div>
      <button id="collapse">折叠</button>
    </div>
    <div id="content">
      <div class="grid" id="kpi"></div>
      <div class="row">
        <div class="caption">规划任务进度</div>
        <div class="bar"><div class="fill" id="taskProgress" style="width:0;background:linear-gradient(90deg,var(--run),var(--ok));"></div></div>
        <div class="tasks"><span id="taskSummary"></span><span id="runningTodo"></span></div>
      </div>
      <div class="row">
        <div class="caption">执行时间 / 空闲时间（跳变进度显示）</div>
        <div class="bar"><div class="fill" id="activeProgress" style="width:0;background:linear-gradient(90deg,#22c55e,#0ea5e9);"></div></div>
        <div class="tasks"><span id="timeSummary"></span></div>
      </div>
      <div class="row">
        <div class="caption">Agents</div>
        <table>
          <thead><tr><th class="sortable" data-sort="status">状态</th><th class="sortable" data-sort="agent">Agent</th><th class="sortable" data-sort="executed">任务次数</th><th class="sortable" data-sort="tokens">Token</th><th class="sortable" data-sort="avg">平均周期</th></tr></thead>
          <tbody id="agentsBody"></tbody>
        </table>
      </div>
      <div id="footer"></div>
    </div>
  </div>

  <script>
    const panel = document.getElementById('panel');
    const bar = document.getElementById('bar');
    const collapse = document.getElementById('collapse');
    let drag = null;
    let collapsed = false;
    let lastAgentsSignature = '';
    let sortState = { key: 'default', dir: 'asc' };
    const statusOrder = { running: 0, retry: 1, error: 2, idle: 3, unknown: 4 };

    bar.addEventListener('mousedown', (event) => {
      if (event.target === collapse) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    });
    window.addEventListener('mousemove', (event) => {
      if (!drag) return;
      panel.style.right = 'auto';
      panel.style.left = Math.max(8, event.clientX - drag.x) + 'px';
      panel.style.top = Math.max(8, event.clientY - drag.y) + 'px';
    });
    window.addEventListener('mouseup', () => { drag = null; });

    collapse.addEventListener('click', () => {
      collapsed = !collapsed;
      document.body.classList.toggle('collapsed', collapsed);
      collapse.textContent = collapsed ? '展开' : '折叠';
    });

    document.addEventListener('click', (event) => {
      const target = event.target.closest('th.sortable');
      if (!target) return;
      const key = target.dataset.sort;
      sortState = { key, dir: sortState.key === key ? (sortState.dir === 'asc' ? 'desc' : 'asc') : defaultSortDir(key) };
      lastAgentsSignature = '';
      refresh();
    });

    function defaultSortDir(key) {
      return key === 'executed' || key === 'tokens' || key === 'avg' ? 'desc' : 'asc';
    }

    function fmtMs(ms) {
      const sec = Math.max(Math.round(ms / 1000), 0);
      if (sec < 60) return sec + 's';
      const min = Math.floor(sec / 60);
      if (min < 60) return sec % 60 === 0 ? min + 'm' : min + 'm' + String(sec % 60).padStart(2, '0') + 's';
      const hour = Math.floor(min / 60);
      return min % 60 === 0 ? hour + 'h' : hour + 'h' + String(min % 60).padStart(2, '0') + 'm';
    }

    function fmtToken(value) {
      const token = Number(value || 0);
      if (token < 1000) return String(token);
      if (token < 1000000) return trimFixed(token / 1000) + 'K';
      return trimFixed(token / 1000000) + 'M';
    }

    function trimFixed(value) {
      return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
    }

    function kindRank(kind) {
      if (kind === 'main') return 0;
      if (kind === 'subagent') return 1;
      if (kind === 'category') return 2;
      return 3;
    }

    function sortedAgents(agents) {
      const direction = sortState.dir === 'desc' ? -1 : 1;
      const pinned = agents.filter((agent) => agent.name === 'main');
      const sortable = agents.filter((agent) => agent.name !== 'main');
      const sorted = sortState.key === 'default'
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
      if (key === 'status') return (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
      if (key === 'agent') return String(left.displayName).localeCompare(String(right.displayName));
      if (key === 'executed') return (left.executed ?? 0) - (right.executed ?? 0);
      if (key === 'tokens') return (left.totalTokens ?? 0) - (right.totalTokens ?? 0);
      if (key === 'avg') return (left.avgMs ?? 0) - (right.avgMs ?? 0);
      return 0;
    }

    function statusText(status) {
      if (status === 'running') return '运行中';
      if (status === 'retry') return '重试';
      if (status === 'error') return '异常';
      if (status === 'idle') return '空闲';
      return '未知';
    }

    function kindText(agent) {
      const suffix = agent.background ? ' · 后台' : '';
      if (agent.kind === 'main') return '主Agent' + suffix;
      if (agent.kind === 'subagent') return '子Agent' + suffix;
      if (agent.kind === 'category') return '类别任务' + suffix;
      return '工具' + suffix;
    }

    function kindBadge(agent) {
      if (agent.kind === 'main') return '【主】';
      if (agent.kind === 'subagent') return agent.background ? '【子·后台】' : '【子】';
      if (agent.kind === 'category') return '【类】';
      return '【工具】';
    }

    function kindClass(agent) {
      if (agent.kind === 'main') return 'kind-main';
      if (agent.kind === 'subagent') return 'kind-subagent';
      if (agent.kind === 'category') return 'kind-category';
      return 'kind-tool';
    }

    function colorByStatus(status) {
      if (status === 'running') return 'running';
      if (status === 'retry') return 'retry';
      if (status === 'error') return 'error';
      if (status === 'idle') return 'idle';
      return 'unknown';
    }

    function pct(v) {
      return Math.max(0, Math.min(100, Math.round(v)));
    }

    async function refresh() {
      const response = await fetch('/state', { cache: 'no-store' });
      const data = await response.json();

      const activeRatio = data.session.elapsedMs > 0 ? (data.session.activeMs / data.session.elapsedMs) * 100 : 0;
      const idleRatio = 100 - activeRatio;

      document.getElementById('kpi').innerHTML = [
        ['任务进度', data.todos.progress + '%'],
        ['总消耗 Token', String(data.session.totalTokens)],
        ['已执行时长', fmtMs(data.session.activeMs)],
        ['空闲持续', fmtMs(data.session.idleMs)],
      ].map(([label, value]) => '<div class="kpi"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>').join('');

      document.getElementById('taskProgress').style.width = pct(data.todos.progress) + '%';
      document.getElementById('taskSummary').textContent = '完成 ' + data.todos.done + '/' + data.todos.total + '，待处理 ' + data.todos.pending;
      document.getElementById('runningTodo').textContent = data.todos.inProgress.length > 0 ? '进行中：' + data.todos.inProgress.join(' / ') : '进行中：无';

      document.getElementById('activeProgress').style.width = pct(activeRatio) + '%';
      document.getElementById('timeSummary').textContent = '活跃占比 ' + pct(activeRatio) + '%，空闲占比 ' + pct(idleRatio) + '%';

      const body = document.getElementById('agentsBody');
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
                '<br><span class="caption">' + kindText(agent) + (agent.name === 'main' ? ' · 内部名: main' : '') + (agent.parentAgent ? ' · 父: ' + agent.parentAgent : '') + '</span></td>' +
                '<td>' + agent.executed + '</td>' +
                '<td title="' + agent.totalTokens + '">' + fmtToken(agent.totalTokens) + '</td>' +
                '<td>' + fmtMs(agent.avgMs) + '</td>' +
              '</tr>';
            }).join('');
      }

      document.getElementById('footer').textContent = '会话状态：' + statusText(data.session.status) + ' · 更新时间：' + new Date(data.updatedAt).toLocaleTimeString();
    }

    function updateSortHeaders() {
      document.querySelectorAll('th.sortable').forEach((header) => {
        const label = header.dataset.label || header.textContent.replace(/[↑↓↕]/g, '').trim();
        header.dataset.label = label;
        if (sortState.key === 'default') {
          header.textContent = header.dataset.sort === 'status' ? label + ' ↑' : label;
          return;
        }
        header.textContent = header.dataset.sort === sortState.key ? label + (sortState.dir === 'asc' ? ' ↑' : ' ↓') : label;
      });
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}

export default plugin;

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");
const statusRank = { running: 0, retry: 1, error: 2, idle: 3, unknown: 4 };

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
  const agents = sortedAgents(Array.isArray(state.agents) ? state.agents : []);
  const now = Date.now();
  const startedAt = state.session?.startedAt ?? now;
  const lastActiveAt = state.session?.lastActiveAt ?? startedAt;
  const activeMs = Math.max(state.session?.totalActiveMs ?? 0, 0);
  const elapsedMs = Math.max(now - startedAt, 0);
  const idleMs = Math.max(now - lastActiveAt, 0);

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
      return {
        name: agent.name,
        status: agent.status,
        executed,
        avgMs: executed > 0 ? Math.round(totalMs / executed) : 0,
      };
    }),
  };
}

function sortedAgents(agents) {
  return [...agents].sort((left, right) => {
    const statusDiff = (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return (right.executed ?? 0) - (left.executed ?? 0) || String(left.name).localeCompare(String(right.name));
  });
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
    .status { font-weight: 700; }
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
          <thead><tr><th>状态</th><th>Agent</th><th>任务次数</th><th>平均周期</th></tr></thead>
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

    function fmtMs(ms) {
      const sec = Math.max(Math.round(ms / 1000), 0);
      if (sec < 60) return sec + 's';
      const min = Math.floor(sec / 60);
      return min + 'm' + String(sec % 60).padStart(2, '0') + 's';
    }

    function statusText(status) {
      if (status === 'running') return '运行中';
      if (status === 'retry') return '重试';
      if (status === 'error') return '异常';
      if (status === 'idle') return '空闲';
      return '未知';
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
      body.innerHTML = data.agents.length === 0
        ? '<tr><td colspan="4">暂无 agent 执行记录</td></tr>'
        : data.agents.map((agent) => {
            const cls = colorByStatus(agent.status);
            return '<tr>' +
              '<td class="status ' + cls + '">' + statusText(agent.status) + '</td>' +
              '<td>' + agent.name + '</td>' +
              '<td>' + agent.executed + '</td>' +
              '<td>' + fmtMs(agent.avgMs) + '</td>' +
            '</tr>';
          }).join('');

      document.getElementById('footer').textContent = '会话状态：' + statusText(data.session.status) + ' · 更新时间：' + new Date(data.updatedAt).toLocaleTimeString();
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}

export default plugin;

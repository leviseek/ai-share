import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(pluginDir, "..", "..", "omo-agent-monitor-state.json");
const statusRank = {
  running: 0,
  retry: 1,
  error: 2,
  idle: 3,
  unknown: 4,
};
const sectionState = {
  todos: true,
  agents: true,
};
const pagingState = {
  agents: 0,
};
const agentPageSize = 7;
const panelWidth = 78;

let latestTodos = [];
let latestSessionStatus = "idle";

const plugin = {
  id: "omo-agent-monitor",
  tui: async (api) => {
    api.event.on("session.status", (event) => {
      latestSessionStatus = event.properties.status.type;
    });

    api.event.on("todo.updated", (event) => {
      latestTodos = event.properties.todos;
    });

    api.command.register(() => [
      {
        title: "OMO agents monitor",
        value: "omo.agent.monitor",
        description: "显示 OMO 编排 agents 状态浮窗",
        category: "OMO",
        slash: { name: "omo-monitor", aliases: ["omom"] },
        onSelect: () => showMonitor(api),
      },
      {
        title: "OMO monitor: toggle todos",
        value: "omo.agent.monitor.toggle.todos",
        description: "折叠或展开规划任务区块",
        category: "OMO",
        slash: { name: "omo-monitor-toggle-todos" },
        onSelect: () => toggleSection(api, "todos"),
      },
      {
        title: "OMO monitor: toggle agents",
        value: "omo.agent.monitor.toggle.agents",
        description: "折叠或展开 agent 列表区块",
        category: "OMO",
        slash: { name: "omo-monitor-toggle-agents" },
        onSelect: () => toggleSection(api, "agents"),
      },
      {
        title: "OMO monitor: next agents page",
        value: "omo.agent.monitor.next",
        description: "滑动到下一页 agents",
        category: "OMO",
        slash: { name: "omo-monitor-next", aliases: ["omomn"] },
        onSelect: () => moveAgentPage(api, 1),
      },
      {
        title: "OMO monitor: previous agents page",
        value: "omo.agent.monitor.prev",
        description: "滑动到上一页 agents",
        category: "OMO",
        slash: { name: "omo-monitor-prev", aliases: ["omomp"] },
        onSelect: () => moveAgentPage(api, -1),
      },
    ]);
  },
};

function showMonitor(api) {
  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() =>
    api.ui.DialogAlert({
      title: "OMO 编排状态 · glass corner",
      message: monitorText(),
      onConfirm: () => api.ui.dialog.clear(),
    }),
  );
}

function toggleSection(api, section) {
  sectionState[section] = !sectionState[section];
  showMonitor(api);
}

function moveAgentPage(api, direction) {
  const totalPages = pageCount(sortedAgents(loadMonitorState().agents ?? []), agentPageSize);
  pagingState.agents = clamp(pagingState.agents + direction, 0, totalPages - 1);
  showMonitor(api);
}

function monitorText() {
  return glassBox(renderMonitor(buildModel()), panelWidth);
}

function buildModel() {
  const todos = latestTodos;
  const done = todos.filter((todo) => todo.status === "completed").length;
  const running = todos.filter((todo) => todo.status === "in_progress");
  const pending = todos.filter((todo) => todo.status === "pending");
  const progress = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;
  const state = loadMonitorState();
  const agents = sortedAgents(state.agents ?? []);
  const totalAgentPages = pageCount(agents, agentPageSize);
  pagingState.agents = clamp(pagingState.agents, 0, totalAgentPages - 1);

  return {
    todos,
    done,
    running,
    pending,
    progress,
    agents,
    visibleAgents: paginate(agents, pagingState.agents, agentPageSize),
    totalAgentPages,
    updatedAt: state.updatedAt,
  };
}

function renderMonitor(model) {
  const lines = [
    "  ◌ placed as a compact corner-style monitor · translucent terminal glass",
    "",
    `  ${statusBadge(latestSessionStatus)} session ${latestSessionStatus}    ${model.done}/${model.todos.length} tasks    ${model.progress}%`,
    `  ${progressBar(model.progress, 34)}  ${statusSummary(model.agents)}`,
    "  ┄┄┄┄┄┄┄┄┄┄┄┄ controls ┄┄┄┄┄┄┄┄┄┄┄┄",
    "  /omo-monitor-toggle-todos · /omo-monitor-toggle-agents · /omo-monitor-prev · /omo-monitor-next",
    "",
    ...renderTodoSection(model),
    "",
    ...renderAgentSection(model),
    "",
    `  updated ${model.updatedAt ? new Date(model.updatedAt).toLocaleTimeString() : "暂无"}  ·  Enter closes, slash commands reopen`,
  ];

  return lines;
}

function renderTodoSection(model) {
  const header = sectionHeader(
    "规划任务",
    sectionState.todos,
    `${model.done}/${model.todos.length} done · ${model.running.length} active · ${model.pending.length} pending`,
  );
  if (!sectionState.todos) return [header, `  ${softLine(currentTodoSummary(model.running))}`];

  const lines = [header, `  当前进度  ${currentTodoSummary(model.running)}`];

  for (const todo of model.todos.slice(0, 5)) {
    lines.push(`  ${todoIcon(todo.status)} ${trimText(todo.content, 64)}`);
  }
  if (model.todos.length > 5) lines.push(`  · 还有 ${model.todos.length - 5} 个任务未显示`);
  if (model.todos.length === 0) lines.push("  · 暂无规划任务，开始执行后会自动同步");

  return lines;
}

function renderAgentSection(model) {
  const header = sectionHeader(
    "Agents",
    sectionState.agents,
    `${model.agents.length} tracked · page ${pagingState.agents + 1}/${model.totalAgentPages}`,
  );
  if (!sectionState.agents) return [header, `  ${softLine(statusSummary(model.agents))}`];

  const lines = [header, "  状态      agent                   次数   平均耗时   总耗时"];

  if (model.visibleAgents.length === 0) {
    lines.push("  · 暂无 agent 执行记录；执行 task/subagent 后自动汇总");
  } else {
    for (const agent of model.visibleAgents) {
      lines.push(
        `  ${pad(statusBadge(agent.status), 8)} ${pad(agent.name, 22)} ${pad(String(agent.executed), 6)} ${pad(
          duration(agent.executed > 0 ? agent.totalMs / agent.executed : currentElapsed(agent)),
          10,
        )} ${duration(agent.totalMs + currentElapsed(agent))}`,
      );
    }
  }

  lines.push(`  ${pageRail(pagingState.agents, model.totalAgentPages)}  /omo-monitor-prev · /omo-monitor-next`);
  return lines;
}

function sortedAgents(agents) {
  return [...agents].sort((left, right) => {
    const statusDiff = statusRank[left.status] - statusRank[right.status];
    if (statusDiff !== 0) return statusDiff;
    return right.totalMs - left.totalMs || left.name.localeCompare(right.name);
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

function currentElapsed(agent) {
  return agent.activeSince ? Math.max(Date.now() - agent.activeSince, 0) : 0;
}

function statusLabel(status) {
  if (status === "running") return "运行中";
  if (status === "retry") return "重试";
  if (status === "error") return "异常";
  if (status === "idle") return "空闲";
  return "未知";
}

function statusBadge(status) {
  if (status === "running") return "● 运行中";
  if (status === "retry") return "◐ 重试";
  if (status === "error") return "× 异常";
  if (status === "idle") return "· 空闲";
  return "◇ 未知";
}

function statusSummary(agents) {
  const counts = agents.reduce(
    (summary, agent) => ({ ...summary, [agent.status]: (summary[agent.status] ?? 0) + 1 }),
    {},
  );
  return `● ${counts.running ?? 0}  ◐ ${counts.retry ?? 0}  × ${counts.error ?? 0}  · ${counts.idle ?? 0}`;
}

function todoIcon(status) {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "●";
  if (status === "pending") return "○";
  return "◇";
}

function currentTodoSummary(running) {
  return running.map((todo) => todo.content).join(" / ") || "暂无进行中的规划任务";
}

function sectionHeader(title, expanded, meta) {
  return `  ${expanded ? "▾" : "▸"} ${title}  ${softLine(meta)}`;
}

function progressBar(progress, width) {
  const filled = Math.round((Math.max(0, Math.min(progress, 100)) / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

function duration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
}

function pad(value, length) {
  if (value.length >= length) return value.slice(0, length - 1);
  return value.padEnd(length, " ");
}

function paginate(items, page, pageSize) {
  return items.slice(page * pageSize, page * pageSize + pageSize);
}

function pageCount(items, pageSize) {
  return Math.max(Math.ceil(items.length / pageSize), 1);
}

function pageRail(page, totalPages) {
  const width = 12;
  if (totalPages <= 1) return "[────────────] 1/1";
  const marker = Math.round((page / (totalPages - 1)) * (width - 1));
  return `[${Array.from({ length: width }, (_, index) => (index === marker ? "◆" : "─")).join("")}] ${page + 1}/${totalPages}`;
}

function glassBox(lines, width) {
  const innerWidth = width - 4;
  const top = `╭${"─".repeat(width - 2)}╮`;
  const bottom = `╰${"─".repeat(width - 2)}╯`;
  const body = lines.map((line) => `│░ ${pad(trimText(line, innerWidth), innerWidth)} ░│`);
  return [top, ...body, bottom].join("\n");
}

function softLine(value) {
  return `┄ ${value}`;
}

function trimText(value, length) {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(length - 1, 0))}…`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default plugin;

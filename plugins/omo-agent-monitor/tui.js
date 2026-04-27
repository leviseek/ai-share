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
        description: "显示 OMO 编排 agents 状态与任务进度",
        category: "OMO",
        slash: { name: "omo-monitor", aliases: ["omom"] },
        onSelect: () => showMonitor(api),
      },
    ]);
  },
};

function showMonitor(api) {
  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() =>
    api.ui.DialogAlert({
      title: "OMO 编排状态",
      message: monitorText(),
      onConfirm: () => api.ui.dialog.clear(),
    }),
  );
}

function monitorText() {
  const todos = latestTodos;
  const done = todos.filter((todo) => todo.status === "completed").length;
  const running = todos.filter((todo) => todo.status === "in_progress");
  const pending = todos.filter((todo) => todo.status === "pending");
  const progress = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;
  const state = loadMonitorState();
  const agents = sortedAgents(state.agents ?? []);
  const lines = [
    `session: ${latestSessionStatus}`,
    `规划任务：${done}/${todos.length} · ${progress}% · 进行中 ${running.length} · 待处理 ${pending.length}`,
    progressBar(progress),
    `当前进度：${running.map((todo) => todo.content).join(" / ") || "暂无进行中的规划任务"}`,
    "",
    "状态       agent                    次数   平均耗时   总耗时",
  ];

  if (agents.length === 0) {
    lines.push("暂无 agent 执行记录；执行 task/subagent 后这里会自动汇总。");
  } else {
    for (const agent of agents) {
      lines.push(
        `${pad(statusLabel(agent.status), 10)} ${pad(agent.name, 22)} ${pad(String(agent.executed), 6)} ${pad(
          duration(agent.executed > 0 ? agent.totalMs / agent.executed : currentElapsed(agent)),
          10,
        )} ${duration(agent.totalMs + currentElapsed(agent))}`,
      );
    }
  }

  lines.push("", `指标更新时间：${state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : "暂无"}`);
  return lines.join("\n");
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

function progressBar(progress) {
  const width = 24;
  const filled = Math.round((Math.max(0, Math.min(progress, 100)) / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${progress}%`;
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

export default plugin;

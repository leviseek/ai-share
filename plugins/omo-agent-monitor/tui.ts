import { ensureWebUi, openBrowser } from "./tui/web-server.ts";
import type { Plugin } from "./tui/types.ts";

function registerCommands(api: Parameters<Plugin["tui"]>[0]): void {
  const commands = [
    {
      title: "OMO agents monitor",
      value: "omo.agent.monitor",
      description: "打开 OMO 编排状态 WebUI 浮窗",
      category: "OMO",
      keybind: "ctrl+shift+o",
      slash: { name: "omo-monitor", aliases: ["omom"] },
      onSelect: openMonitorCommand,
    },
  ];

  if (api.command?.register) {
    api.command.register(() => commands);
    return;
  }

  api.route?.register([
    {
      name: "omo.agent.monitor",
      render: () =>
        api.ui?.DialogConfirm({
          title: "OMO agents monitor",
          message: "当前 OpenCode 版本未暴露 command.register，已切换到 route 兼容入口。是否打开 OMO 编排状态 WebUI？",
          onConfirm: openMonitorCommand,
        }) ?? null,
    },
  ]);

  api.ui?.toast?.({
    title: "OMO agents monitor",
    message: "当前 OpenCode TUI 未暴露 command.register，已启用 route 兼容入口。",
    variant: "warning",
  });
}

const plugin: Plugin = {
  id: "omo-agent-monitor",
  tui: async (api) => {
    registerCommands(api);
  },
};

async function openMonitorCommand(): Promise<void> {
  const url = await ensureWebUi();
  openBrowser(url);
}

export default plugin;

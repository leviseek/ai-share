import { ensureWebUi, openBrowser } from "./tui/web-server.ts";
import type { Plugin } from "./tui/types.ts";

const plugin: Plugin = {
  id: "omo-agent-monitor",
  tui: async (api) => {
    api.command.register(() => [
      {
        title: "OMO agents monitor",
        value: "omo.agent.monitor",
        description: "打开 OMO 编排状态 WebUI 浮窗",
        category: "OMO",
        keybind: "ctrl+shift+o",
        slash: { name: "omo-monitor", aliases: ["omom"] },
        onSelect: openMonitorCommand,
      },
    ]);
  },
};

async function openMonitorCommand(): Promise<void> {
  const url = await ensureWebUi();
  openBrowser(url);
}

export default plugin;

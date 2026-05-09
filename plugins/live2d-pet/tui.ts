import { ensureWebUi, openBrowser } from "./tui/web-server.ts";

type Plugin = {
  id: string;
  tui(api: { command: { register(callback: () => unknown[]): void } }): Promise<void>;
};

const plugin: Plugin = {
  id: "live2d-pet",
  tui: async (api) => {
    api.command.register(() => [
      {
        title: "Live2D pet",
        value: "live2d.pet.open",
        description: "打开 Live2D 宠物 WebUI",
        category: "TUI",
        keybind: "ctrl+shift+l",
        slash: { name: "live2d-pet", aliases: ["l2dpet"] },
        onSelect: openPetCommand,
      },
    ]);
  },
};

async function openPetCommand(): Promise<void> {
  const url = await ensureWebUi();
  openBrowser(url);
}

export default plugin;

import { ensureWebUi, openBrowser } from "./tui/web-server.ts";

type TuiApi = {
  command?: { register(factory: () => TuiCommand[]): void };
};

type TuiCommand = {
  title: string;
  value: string;
  description: string;
  category?: string;
  keybind?: string;
  slash?: { name: string; aliases?: string[] };
  onSelect(): Promise<void> | void;
};

type Plugin = {
  id: string;
  tui(api: TuiApi): Promise<void>;
};

const plugin: Plugin = {
  id: "live2d-pet",
  tui: async (api) => {
    registerCommands(api);
    void openPetCommand();
  },
};

function registerCommands(api: TuiApi): void {
  api.command?.register(() => [
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
}

async function openPetCommand(): Promise<void> {
  const url = await ensureWebUi();
  try {
    openBrowser(url);
  } catch {
    // Browser launching is best-effort only.
  }
}

export default plugin;

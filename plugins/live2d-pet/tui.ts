type TuiApi = {
  command?: { register(factory: () => TuiCommand[]): void };
};

declare const Bun: {
  spawn(command: string[], options: { stdout: "ignore"; stderr: "ignore" }): { unref(): void };
  which(command: string): string | null;
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
  try {
    const command = Bun.which("live2d-pet");
    if (!command) return;
    const child = Bun.spawn([command], { stdout: "ignore", stderr: "ignore" });
    child.unref();
  } catch {
    // Window launching is best-effort only.
  }
}

export default plugin;

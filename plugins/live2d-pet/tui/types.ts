export type Plugin = {
  id: string;
  tui(api: TuiApi): Promise<void>;
};

export type TuiApi = {
  command: {
    register(factory: () => TuiCommand[]): void;
  };
};

export type TuiCommand = {
  title: string;
  value: string;
  description: string;
  category?: string;
  keybind?: string;
  slash?: { name: string; aliases?: string[] };
  onSelect(): Promise<void> | void;
};

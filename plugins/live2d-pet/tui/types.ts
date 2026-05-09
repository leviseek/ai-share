export type Plugin = {
  id: string;
  tui(api: TuiApi): Promise<void>;
};

export type TuiApi = {
  command?: {
    register(factory: () => TuiCommand[]): void;
  };
  route?: {
    register(routes: Array<{ name: string; render(input: { params?: Record<string, unknown> }): unknown }>): () => void;
  };
  ui?: {
    DialogConfirm(props: { title: string; message: string; onConfirm?: () => void; onCancel?: () => void }): unknown;
    toast?(input: { message: string; title?: string; variant?: "info" | "success" | "warning" | "error" }): void;
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

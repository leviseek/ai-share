type Plugin = {
  id: string;
  server(): Promise<Record<string, (event: Record<string, unknown>) => Promise<void>>>;
};

const plugin: Plugin = {
  id: "live2d-pet",
  server: async () => ({}),
};

export default plugin;

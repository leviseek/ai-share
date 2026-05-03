type Plugin = {
  id: string;
  tui(): Promise<void>;
};

const plugin: Plugin = {
  id: "dingtalk-notifier",
  tui: async () => {},
};

export default plugin;

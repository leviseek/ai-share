export type ProviderYaml = {
  providers: Record<string, ProviderSource>;
};

export type McpYaml = {
  servers: Record<string, McpServerSource>;
};

export type EnvYaml = {
  variables: Record<string, string>;
};

export type AgentsYaml = {
  agents: Record<string, AgentSource>;
};

export type PluginsYaml = {
  plugins: string[];
};

export type AgentSource = {
  description: string;
  model?: string;
  reasoning_effort?: "low" | "medium" | "high";
  mode: "primary" | "subagent" | "all";
  prompt: string;
};

export type McpServerSource = {
  transport?: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  bearer_token_env_var?: string;
  oauth_client_id?: string;
};

export type ProviderSource = {
  name?: string;
  base_url: string;
  api_key: string;
  models: string[];
  default_model: string;
  native?: boolean;
  always_include?: boolean;
};

export type ModelsYaml = Record<string, ModelSource>;

export type ModelSource = {
  model_name: string;
  reasoning_effort?: "low" | "medium" | "high";
};

export type GlobalYaml = {
  model: string;
  provider: string;
  opencode_min_version?: string;
};

export interface WezTermConfig {
  shell: "platform-native" | "wezterm-default";
  color_scheme: "catppuccin-mocha" | "dracula" | "tokyo-night" | "wezterm-default";
  font_size: 11 | 12 | 13;
  window_background_opacity: 0.88 | 0.94 | 1;
  maximize_on_startup: boolean;
  exit_behavior: "hold" | "close" | "close-on-clean-exit";
  scrollback_lines: 10000 | 100000 | 1000000;
}

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

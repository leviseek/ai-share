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

export type ToolManager = "bun" | "scoop" | "brew";
export type ToolPlatform = "win32" | "darwin" | "linux";
export type ToolPlatformConfig = { manager: ToolManager };
export type ToolSource = {
  id: string;
  label: string;
  package: string;
  executable: string;
  required: boolean;
  version: string;
  platforms: Partial<Record<ToolPlatform, ToolPlatformConfig>>;
};
export type ToolsYaml = { tools: ToolSource[] };

export type ArchifyConfig = {
  repo: string;
  skill: string;
  ref: string;
  enabled: boolean;
};
export type ArchifyYaml = { archify: ArchifyConfig };

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
  attachment?: boolean;
  modalities?: {
    input?: readonly string[];
    output?: readonly string[];
  };
};

export type GlobalYaml = {
  model: string;
  provider: string;
  opencode_min_version?: string;
};

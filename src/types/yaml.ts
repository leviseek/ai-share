export type ModelRole = "primary" | "reasoning" | "fast";

export type ModelRoleMap = Record<string, string> & Partial<Record<ModelRole, string>>;

export type PermissionMap = Record<string, string>;

export type ProviderYaml = {
  providers?: Record<string, ProviderSource>;
};

export type McpYaml = {
  servers?: Record<string, McpServerSource>;
};

export type McpServerSource = {
  transport?: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  bearer_token_env_var?: string;
  oauth_client_id?: string;
  oauth_resource?: string;
};

export type ProviderSource = {
  name?: string;
  short_name?: string;
  npm?: string;
  base_url?: string;
  api_key?: string;
  timeout?: number;
  chunkTimeout?: number;
};

export type ModelsYaml = Record<string, ModelSource>;

export type ModelCost = {
  input?: number;
  output?: number;
};

export type ModelLimits = {
  context_window?: number;
  max_output?: number;
};

export type ModelSource = {
  provider?: string;
  provider_group?: string;
  model_name?: string;
  capabilities?: string[];
  cost?: ModelCost;
  limits?: ModelLimits;
  temperature?: number;
  parameters?: Record<string, unknown>;
  fallback?: string[];
};

export type GlobalYaml = {
  default_profile?: string;
  codex_min_version?: string;
  omx_min_version?: string;
  env?: GlobalEnvironment;
  features?: GlobalFeatures;
  runtime?: GlobalRuntime;
  models?: GlobalModels;
  context?: GlobalContext;
  workspace?: GlobalWorkspace;
  compaction?: GlobalCompaction;
  telemetry?: GlobalTelemetry;
};

export type GlobalEnvironment = {
  mode?: "dev" | "staging" | "prod";
  log_level?: "debug" | "info" | "warn" | "error";
};

export type GlobalFeatures = {
  auto_router?: boolean;
  memory?: boolean;
  fallback?: boolean;
  cost_tracking?: boolean;
};

export type GlobalRuntime = {
  timeout_ms?: number;
  max_retries?: number;
};

export type GlobalModels = {
  default?: string;
  small?: string;
};

export type GlobalContext = {
  max_tokens?: number;
  strategy?: "truncate" | "summarize" | "split";
  cache_enabled?: boolean;
};

export type GlobalWorkspace = {
  ignore?: string[];
};

export type GlobalCompaction = {
  enabled?: boolean;
  threshold?: number;
  model?: string;
  max_input_tokens?: number;
  prune?: boolean;
  reserved?: number;
};

export type GlobalTelemetry = {
  enabled?: boolean;
  endpoint?: string;
};

export type AgentPrompt = {
  system?: string;
  append?: string;
};

export type AgentSource = {
  model?: string;
  prompt?: AgentPrompt;
  permission?: PermissionMap;
};

export type AgentsYaml = {
  shared_prompt?: AgentPrompt;
  agents?: Record<string, AgentSource>;
};

export type ProfilesYaml = Record<string, AgentProfileSource>;

export type AgentProfileSource = {
  name?: string;
  models?: ModelRoleMap;
  compaction?: GlobalCompaction;
};

export type ModelRole = "primary" | "reasoning" | "fast";
export type ReasoningLevel = "low" | "medium" | "high";

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
};

export type ProfileCompaction = {
  enabled?: boolean;
  threshold?: number;
  model?: string;
  max_input_tokens?: number;
  prune?: boolean;
  reserved?: number;
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
  codex?: CodexRuntimeSource;
  omx?: OmxRuntimeSource;
  agents?: Record<string, AgentSource>;
};

export type CodexRuntimeSource = {
  agents?: CodexAgentsSource;
};

export type CodexAgentsSource = {
  max_threads?: number;
  max_depth?: number;
  job_max_runtime_seconds?: number;
};

export type OmxRuntimeSource = {
  model_slots?: Record<string, ModelRole>;
  agent_reasoning?: Record<string, ReasoningLevel>;
};

export type ProfilesYaml = Record<string, AgentProfileSource>;

export type AgentProfileSource = {
  name?: string;
  models?: ModelRoleMap;
  compaction?: ProfileCompaction;
};

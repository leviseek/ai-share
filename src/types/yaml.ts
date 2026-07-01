export type ModelRole = "primary" | "reasoning" | "fast";

export type ModelRoleMap = Record<string, string> & Partial<Record<ModelRole, string>>;

export type ProviderYaml = {
  providers?: Record<string, ProviderSource>;
};

export type McpYaml = {
  servers?: Record<string, McpServerSource>;
};

export type EnvYaml = {
  variables?: Record<string, string>;
};

export type ProfileEvalYaml = {
  task_set?: string;
  tasks?: Record<string, ProfileEvalTaskSource>;
  scoring?: ProfileEvalScoringSource;
};

export type ProfileEvalTaskSource = {
  title?: string;
  category?: string;
  weight?: number;
  prompt?: string;
  success_criteria?: string[];
};

export type ProfileEvalScoringSource = {
  pass_score?: number;
  dimensions?: Record<string, ProfileEvalScoringDimensionSource>;
};

export type ProfileEvalScoringDimensionSource = {
  weight?: number;
  description?: string;
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
};

export type ProfileCompaction = {
  enabled?: boolean;
  threshold?: number;
  model?: string;
  max_input_tokens?: number;
  prune?: boolean;
  reserved?: number;
};

export type ProfilesYaml = Record<string, ProfileSource>;

export type ProfileSource = {
  name?: string;
  models?: ModelRoleMap;
  compaction?: ProfileCompaction;
};

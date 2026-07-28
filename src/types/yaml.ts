export type ProviderYaml = {
  providers?: Record<string, ProviderSource>;
};

export type McpYaml = {
  servers?: Record<string, McpServerSource>;
};

export type EnvYaml = {
  variables?: Record<string, string>;
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
  model?: string;
  codex_min_version?: string;
  codex_allow_login_shell?: boolean;
  codex_windows?: CodexWindowsSource;
  codex_shell_environment_policy?: CodexShellEnvironmentPolicySource;
};

export type CodexWindowsSource = {
  sandbox?: "elevated" | "unelevated";
};

export type CodexShellEnvironmentPolicySource = {
  inherit?: "all" | "core" | "none";
  ignore_default_excludes?: boolean;
  experimental_use_profile?: boolean;
  exclude?: string[];
  include_only?: string[];
  set?: Record<string, string>;
};

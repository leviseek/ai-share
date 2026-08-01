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

export type AgentSource = {
  description: string;
  model?: string;
  reasoning_effort?: "low" | "medium" | "high";
  developer_instructions: string;
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

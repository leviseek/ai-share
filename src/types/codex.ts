export type CodexCliConfig = {
  model: string;
  model_provider: string;
  model_reasoning_effort?: "low" | "medium" | "high";
  model_instructions_file: string;
  allow_login_shell?: boolean;
  windows?: CodexWindowsConfig;
  shell_environment_policy?: CodexShellEnvironmentPolicyConfig;
  model_providers: Record<string, CodexCliProvider>;
  mcp_servers?: Record<string, CodexMcpServer>;
};

export type CodexAgentConfig = {
  name: string;
  description: string;
  model?: string;
  model_reasoning_effort?: "low" | "medium" | "high";
  developer_instructions: string;
};

export type CodexWindowsConfig = {
  sandbox?: "elevated" | "unelevated";
};

export type CodexShellEnvironmentPolicyConfig = {
  inherit?: "all" | "core" | "none";
  ignore_default_excludes?: boolean;
  experimental_use_profile?: boolean;
  exclude?: string[];
  include_only?: string[];
  set?: Record<string, string>;
};

export type CodexCliProvider = {
  name?: string;
  base_url: string;
  env_key: string;
};

export type CodexMcpServer = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  bearer_token_env_var?: string;
  oauth_client_id?: string;
  oauth_resource?: string;
};

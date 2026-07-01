export type CodexCliProfileConfig = {
  model: string;
  model_provider: string;
  model_reasoning_effort?: "low" | "medium" | "high";
  model_instructions_file: string;
  model_providers: Record<string, CodexCliProvider>;
  mcp_servers?: Record<string, CodexMcpServer>;
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

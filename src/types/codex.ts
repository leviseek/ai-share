export type CodexCliProfileConfig = {
  model: string;
  model_provider: string;
  model_reasoning_effort?: "low" | "medium" | "high";
  model_instructions_file: string;
  model_providers: Record<string, CodexCliProvider>;
  mcp_servers?: Record<string, CodexMcpServer>;
  agents?: CodexCliAgentsConfig;
};

export type CodexCliProvider = {
  name?: string;
  base_url: string;
  env_key: string;
};

export type CodexCliAgentsConfig = {
  max_threads?: number;
  max_depth?: number;
  job_max_runtime_seconds?: number;
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

export type CodexAgentConfig = {
  name: string;
  description: string;
  model?: string;
  sandbox_mode?: "read-only";
  developer_instructions: string;
};

export type OmxConfig = {
  env: {
    OMX_DEFAULT_FRONTIER_MODEL: string;
    OMX_DEFAULT_STANDARD_MODEL: string;
    OMX_DEFAULT_SPARK_MODEL: string;
  };
  models: Record<string, string>;
  agentReasoning: Record<string, "low" | "medium" | "high">;
};

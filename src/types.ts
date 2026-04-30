export type ModelRole = "primary" | "reasoning" | "fast";

export type ModelRoleMap = Record<string, string> & Partial<Record<ModelRole, string>>;

export type PermissionMap = Record<string, string>;

export type ProviderYaml = {
  providers?: Record<string, ProviderSource>;
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
  env?: GlobalEnvironment;
  features?: GlobalFeatures;
  runtime?: GlobalRuntime;
  opencode?: GlobalOpenCode;
  tui?: GlobalTui;
  models?: GlobalModels;
  context?: GlobalContext;
  context_guard?: GlobalContextGuard;
  compaction?: GlobalCompaction;
  dcp?: StrategySource;
  checkpoint?: StrategySource;
  memory?: StrategySource;
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

export type GlobalOpenCode = {
  plugins?: string[];
  optional_plugins?: string[];
};

export type GlobalTui = {
  plugins?: string[];
};

export type GlobalModels = {
  default?: string;
  small?: string;
};

export type GlobalContext = {
  max_tokens?: number;
  strategy?: "truncate" | "summarize" | "split";
};

export type GlobalContextGuard = {
  enabled?: boolean;
  warn_ratio?: number;
  danger_ratio?: number;
  block_ratio?: number;
  absolute_block_tokens?: number;
  rescue_dir?: string;
  diagnostics?: boolean;
};

export type GlobalCompaction = {
  enabled?: boolean;
  threshold?: number;
  model?: string;
  max_input_tokens?: number;
  prune?: boolean;
  reserved?: number;
};

export type StrategySource = Record<string, unknown>;

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
  model_fallback?: boolean;
  agents?: Record<string, AgentSource>;
  categories?: Record<string, AgentSource>;
  runtime_fallback?: RuntimeFallbackSource;
  background_task?: BackgroundTaskSource;
  dcp?: StrategySource;
  checkpoint?: StrategySource;
  memory?: StrategySource;
  tmux?: TmuxSource;
};

export type ProfilesYaml = Record<string, AgentProfileSource>;

export type AgentProfileSource = {
  name?: string;
  models?: ModelRoleMap;
  compaction?: GlobalCompaction;
  strategies?: ProfileStrategies;
};

export type ProfileStrategies = {
  opencode?: StrategyOverrides;
  oh_my_openagent?: StrategyOverrides;
};

export type StrategyOverrides = {
  dcp?: StrategySource;
  checkpoint?: StrategySource;
  memory?: StrategySource;
};

export type RuntimeFallbackSource = {
  enabled?: boolean;
  retry_on_errors?: number[];
  max_fallback_attempts?: number;
  cooldown_seconds?: number;
  timeout_seconds?: number;
  notify_on_fallback?: boolean;
  model_whitelist?: string[];
};

export type BackgroundTaskSource = {
  providerConcurrency?: Record<string, number>;
  modelConcurrency?: Record<string, number>;
};

export type TmuxSource = {
  enabled?: boolean;
};

export type OpenCodeConfig = {
  $schema: string;
  model: string;
  small_model: string;
  instructions: string[];
  plugin: string[];
  compaction: OpenCodeCompaction;
  agent: Record<string, OpenCodeAgent>;
  provider: Record<string, OpenCodeProvider>;
};

export type TuiConfig = {
  $schema: string;
  plugin: string[];
};

export type OpenCodeCompaction = {
  auto: boolean;
  prune: boolean;
  reserved: number;
};

export type OpenCodeAgent = {
  mode?: "primary" | "subagent";
  model: string;
  max_tokens?: number;
  permission?: PermissionMap;
};

export type OpenCodeProvider = {
  name: string;
  npm: string;
  options: OpenCodeProviderOptions;
  models: Record<string, OpenCodeModel>;
};

export type OpenCodeProviderOptions = {
  baseURL: string;
  apiKey: string;
  timeout?: number;
  chunkTimeout?: number;
};

export type OpenCodeModel = {
  id?: string;
  name: string;
  options?: Record<string, unknown>;
};

export type OhMyOpenAgentConfig = {
  $schema: string;
  model_fallback: boolean;
  disabled_hooks?: string[];
  agents: Record<string, OhMyAgent>;
  categories: Record<string, OhMyAgent>;
  runtime_fallback: OhMyRuntimeFallback;
  background_task: OhMyBackgroundTask;
  tmux: Required<TmuxSource>;
};

export type SharedStrategyConfig = {
  $schema: string;
  profile: string;
  opencode: Required<StrategyOverrides>;
  oh_my_openagent: Required<StrategyOverrides>;
};

export type OhMyRuntimeFallback = {
  enabled: boolean;
  retry_on_errors: number[];
  max_fallback_attempts: number;
  cooldown_seconds: number;
  timeout_seconds: number;
  notify_on_fallback: boolean;
  model_whitelist: string[];
};

export type OhMyBackgroundTask = {
  providerConcurrency: Record<string, number>;
  modelConcurrency: Record<string, number>;
};

export type OhMyAgent = {
  model: string;
  fallback_models?: string[];
  prompt_append?: string;
  permission?: PermissionMap;
};

export type OmoProfileManifest = {
  default_profile: string;
  profiles: string[];
};

export type ProviderGroupMap = Record<string, string>;

export type CliOptions = {
  force: boolean;
  dryRun: boolean;
  checkOnly: boolean;
  providerGroups: ProviderGroupMap;
};

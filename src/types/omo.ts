import type { PermissionMap, TmuxSource } from "./yaml.ts";

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

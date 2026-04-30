import type { GlobalCompaction, GlobalWorkspace, PermissionMap, StrategyOverrides } from "./yaml.ts";

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

export type SharedStrategyConfig = {
  $schema: string;
  profile: string;
  workspace: Required<GlobalWorkspace>;
  opencode: Required<StrategyOverrides>;
  oh_my_openagent: Required<StrategyOverrides>;
};

export type ContextGuardProfileConfig = Pick<GlobalCompaction, "max_input_tokens">;

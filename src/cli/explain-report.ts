import { relative, sep } from "node:path";
import { requireEnvReferenceName } from "../config/env-ref.ts";
import type { GenerationPreview } from "../generation-preview.ts";
import type { MemoryDecision, MemoryExclusion } from "../memory/retrieval.ts";
import type { ProviderDecision, TaskDecision } from "./options.ts";
import type { PlanOwnership, PlanReason } from "./generation-plan.ts";

export type ExplainStatus = "ok" | "collision" | "error";

export type ExplainErrorCode = "config-validation" | "cancelled" | "invalid-provider" | "runtime";

export type ExplainPlanEntry = {
  path: string;
  kind: "create" | "update" | "delete" | "preserve" | "collision";
  reason: PlanReason;
  ownership: PlanOwnership;
};

export type ExplainReport = {
  schema_version: 1;
  status: ExplainStatus;
  inputs: {
    force: boolean;
    provider: {
      id: string;
      source: ProviderDecision["source"];
      config_source: string;
      api_key_env: string;
    };
    model: {
      id: string;
      model_name: string;
      reasoning_effort?: "low" | "medium" | "high";
      id_source: string;
      definition_source: string;
    };
    task: { value?: string; source: "cli" | "environment" | "none" };
  };
  config: {
    base_files: string[];
    active_overlays: string[];
    mcp_server_ids: string[];
    managed_env_names: string[];
    agent_ids: string[];
  };
  memory: {
    fixed_paths: string[];
    selected: MemoryDecision[];
    ranked_candidates: MemoryDecision[];
    policy_exclusions: MemoryExclusion[];
  };
  plan: {
    actions: ExplainPlanEntry[];
    preserved: ExplainPlanEntry[];
    collisions: ExplainPlanEntry[];
  };
  error?: {
    code: ExplainErrorCode;
    messages: string[];
  };
};

export function buildExplainReport(preview: GenerationPreview): ExplainReport {
  const config = preview.loadedConfig.config;
  const providerId = preview.providerDecision.id;
  const provider = config.providers.providers[providerId];
  if (!provider) throw new Error(`提供商未定义：${providerId}`);
  const modelId = config.global.model;
  const model = config.models[modelId];
  if (!model) throw new Error(`模型未定义：${modelId}`);
  const task = preview.taskDecision;

  return {
    schema_version: 1,
    status: preview.plan.collisions.length > 0 ? "collision" : "ok",
    inputs: {
      force: preview.options.force,
      provider: {
        id: providerId,
        source: preview.providerDecision.source,
        config_source: sourceReference(preview.loadedConfig.provenance.providers, `providers.${providerId}.base_url`),
        api_key_env: requireEnvReferenceName(provider.api_key, `providers.${providerId}.api_key`),
      },
      model: {
        id: modelId,
        model_name: model.model_name,
        ...(model.reasoning_effort ? { reasoning_effort: model.reasoning_effort } : {}),
        id_source: sourceReference(preview.loadedConfig.provenance.global, "model"),
        definition_source: sourceReference(preview.loadedConfig.provenance.models, `${modelId}.model_name`),
      },
      task: task.source === "none" ? { source: "none" } : { value: task.value, source: task.source },
    },
    config: {
      base_files: [...preview.loadedConfig.baseFiles],
      active_overlays: [...preview.loadedConfig.overlays],
      mcp_server_ids: Object.keys(config.mcp.servers).sort(compareText),
      managed_env_names: Object.keys(config.env.variables).sort(compareText),
      agent_ids: Object.keys(config.agents.agents).sort(compareText),
    },
    memory: {
      fixed_paths: preview.instructionsSelection.fixedPaths.map((path) =>
        repoRelativePath(preview.paths.projectRoot, path),
      ),
      selected: preview.instructionsSelection.memory.selected.map(cloneMemoryDecision),
      ranked_candidates: preview.instructionsSelection.memory.ranked_candidates.map(cloneMemoryDecision),
      policy_exclusions: preview.instructionsSelection.memory.policy_exclusions.map((entry) => ({ ...entry })),
    },
    plan: explainPlan(preview.plan),
  };
}

export function buildExplainErrorReport(input: {
  code: ExplainErrorCode;
  messages: readonly string[];
  force: boolean;
  providerDecision?: ProviderDecision;
  taskDecision?: TaskDecision;
}): ExplainReport {
  const providerDecision = input.providerDecision ?? { id: "", source: "global-config" };
  const taskDecision = input.taskDecision ?? { source: "none" };
  return {
    schema_version: 1,
    status: "error",
    inputs: {
      force: input.force,
      provider: {
        id: providerDecision.id,
        source: providerDecision.source,
        config_source: "",
        api_key_env: "",
      },
      model: {
        id: "",
        model_name: "",
        id_source: "",
        definition_source: "",
      },
      task:
        taskDecision.source === "none"
          ? { source: "none" }
          : { value: taskDecision.value, source: taskDecision.source },
    },
    config: {
      base_files: [],
      active_overlays: [],
      mcp_server_ids: [],
      managed_env_names: [],
      agent_ids: [],
    },
    memory: {
      fixed_paths: [],
      selected: [],
      ranked_candidates: [],
      policy_exclusions: [],
    },
    plan: { actions: [], preserved: [], collisions: [] },
    error: { code: input.code, messages: [...input.messages] },
  };
}

export function explainPlan(plan: GenerationPreview["plan"]): ExplainReport["plan"] {
  return {
    actions: plan.actions.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      reason: entry.reason,
      ownership: entry.ownership,
    })),
    preserved: plan.preserved.map((entry) => ({ ...entry, kind: "preserve" })),
    collisions: plan.collisions.map((entry) => ({ ...entry, kind: "collision" })),
  };
}

function sourceReference(sources: Readonly<Record<string, string>>, fieldPath: string): string {
  const source = sources[fieldPath];
  if (!source) throw new Error(`缺少配置来源追踪：${fieldPath}`);
  return `${source} → ${fieldPath}`;
}

function repoRelativePath(projectRoot: string, path: string): string {
  return relative(projectRoot, path).split(sep).join("/");
}

function cloneMemoryDecision(decision: MemoryDecision): MemoryDecision {
  return {
    path: decision.path,
    rank: decision.rank,
    selected: decision.selected,
    total_score: decision.total_score,
    score_breakdown: { ...decision.score_breakdown },
    matched_tokens: {
      title: [...decision.matched_tokens.title],
      path: [...decision.matched_tokens.path],
      content: [...decision.matched_tokens.content],
    },
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

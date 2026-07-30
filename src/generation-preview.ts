import { buildCodexCliConfig, formatCodexConfigToml, formatCodexInstructions } from "./config-builders.ts";
import { loadValidatedConfigWithTrace, type LoadedValidatedConfig } from "./config/load.ts";
import { buildInstructionsSelection, type InstructionsSelection } from "./config/builders/instructions.ts";
import { buildGenerationPlan, type GenerationPlan } from "./cli/generation-plan.ts";
import {
  resolveProviderDecision,
  resolveTaskDecision,
  type ProviderDecision,
  type TaskDecision,
} from "./cli/options.ts";
import { buildGeneratorPaths, type GeneratorPaths } from "./cli/paths.ts";
import { buildProviderChoices, selectProviderInteractive, type ProviderSelector } from "./cli/provider-select.ts";

export type GenerationPreviewOptions = {
  force: boolean;
  provider?: string;
  task?: string;
};

export type GenerationPreview = {
  options: GenerationPreviewOptions;
  paths: GeneratorPaths;
  loadedConfig: LoadedValidatedConfig;
  providerDecision: ProviderDecision;
  taskDecision: TaskDecision;
  instructionsSelection: InstructionsSelection;
  configToml: string;
  instructions: string;
  plan: GenerationPlan;
};

export class InvalidProviderError extends Error {
  readonly providerId: string;

  constructor(providerId: string) {
    super(`提供商未定义：${providerId}`);
    this.name = "InvalidProviderError";
    this.providerId = providerId;
  }
}

export async function buildGenerationPreview(input: {
  options: GenerationPreviewOptions;
  env: Record<string, string | undefined>;
  projectRoot?: string;
  providerSelector?: ProviderSelector;
  interactiveProviderSelection?: boolean;
}): Promise<GenerationPreview> {
  const paths = buildGeneratorPaths(input.projectRoot, input.env);
  const loadedConfig = await loadValidatedConfigWithTrace(paths.configDir);
  const config = loadedConfig.config;
  const providerDecision = await selectProviderDecision({
    providers: config.providers.providers,
    ...(input.options.provider ? { cliProvider: input.options.provider } : {}),
    ...(input.env.AI_SHARE_PROVIDER ? { envProvider: input.env.AI_SHARE_PROVIDER } : {}),
    defaultProvider: config.global.provider,
    interactive: input.interactiveProviderSelection !== false,
    ...(input.providerSelector ? { providerSelector: input.providerSelector } : {}),
  });
  if (!config.providers.providers[providerDecision.id]) {
    throw new InvalidProviderError(providerDecision.id);
  }
  const taskDecision = resolveTaskDecision({
    ...(input.options.task ? { cliTask: input.options.task } : {}),
    ...(input.env.AI_SHARE_TASK ? { envTask: input.env.AI_SHARE_TASK } : {}),
  });
  const task = taskDecision.source === "none" ? undefined : taskDecision.value;
  const instructionsSelection = buildInstructionsSelection(paths.projectRoot, task);
  const configToml = formatCodexConfigToml(
    buildCodexCliConfig(config, providerDecision.id, paths.targetCodexInstructions),
  );
  const instructions = formatCodexInstructions(instructionsSelection.paths);
  const plan = await buildGenerationPlan({
    paths,
    configToml,
    instructions,
    envConfig: config.env,
    force: input.options.force,
  });
  return {
    options: { ...input.options },
    paths,
    loadedConfig,
    providerDecision,
    taskDecision,
    instructionsSelection,
    configToml,
    instructions,
    plan,
  };
}

async function selectProviderDecision(input: {
  providers: Parameters<typeof buildProviderChoices>[0];
  cliProvider?: string;
  envProvider?: string;
  defaultProvider: string;
  interactive: boolean;
  providerSelector?: ProviderSelector;
}): Promise<ProviderDecision> {
  const nonInteractiveDecision = resolveProviderDecision({
    ...(input.cliProvider ? { cliProvider: input.cliProvider } : {}),
    ...(input.envProvider ? { envProvider: input.envProvider } : {}),
    defaultProvider: input.defaultProvider,
  });
  if (input.cliProvider || !input.interactive) return nonInteractiveDecision;

  const providerSelector =
    input.providerSelector ?? (process.stdin.isTTY && process.stdout.isTTY ? selectProviderInteractive : undefined);
  if (!providerSelector) return nonInteractiveDecision;
  const validInitialProviderId = input.providers[nonInteractiveDecision.id]
    ? nonInteractiveDecision.id
    : input.defaultProvider;
  return {
    id: await providerSelector(buildProviderChoices(input.providers), validInitialProviderId),
    source: "interactive",
  };
}

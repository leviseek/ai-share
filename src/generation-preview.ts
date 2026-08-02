import { buildOpenCodeConfig, formatOpenCodeConfigJsonc } from "./config-builders.ts";
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
import { buildAiocLauncherFiles } from "./cli/aioc-install.ts";
import { SUPERPOWERS_PLUGIN_SPEC } from "./cli/install-plan.ts";
import { selectInstallInteractive, type InstallChoice } from "./cli/install-select.ts";

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
  configJsonc: string;
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
  pluginSelector?: (choices: readonly InstallChoice[]) => Promise<ReadonlySet<string>>;
}): Promise<GenerationPreview> {
  const paths = buildGeneratorPaths(input.projectRoot, input.env);
  const loadedConfig = await loadValidatedConfigWithTrace(paths.configDir);
  const config = structuredClone(loadedConfig.config);
  const pluginSpecs = [...new Set([...config.plugins.plugins, SUPERPOWERS_PLUGIN_SPEC])];
  const pluginChoices = pluginSpecs.map((spec) => ({
    id: spec,
    label: spec === SUPERPOWERS_PLUGIN_SPEC ? "Superpowers" : spec,
    required: false,
    selected: config.plugins.plugins.includes(spec),
    status: config.plugins.plugins.includes(spec) ? "已启用" : "未启用",
  }));
  if (input.pluginSelector) {
    config.plugins.plugins = [...(await input.pluginSelector(pluginChoices))];
  } else if (process.stdin.isTTY && process.stdout.isTTY && input.interactiveProviderSelection !== false) {
    config.plugins.plugins = [...(await selectInstallInteractive(pluginChoices))];
  }
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
  const configJsonc = formatOpenCodeConfigJsonc(
    buildOpenCodeConfig(config, providerDecision.id, instructionsSelection.paths, paths.targetOpenCodeSkillsDir),
  );
  const plan = await buildGenerationPlan({
    paths,
    configJsonc,
    envConfig: config.env,
    launcherFiles: buildAiocLauncherFiles(paths),
    force: input.options.force,
  });
  return {
    options: { ...input.options },
    paths,
    loadedConfig,
    providerDecision,
    taskDecision,
    instructionsSelection,
    configJsonc,
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

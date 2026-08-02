import { loadConfigYamlWithTrace } from "./local-overlay.ts";
import { validateConfigSet, type ConfigSet, type ValidationError } from "./validation.ts";

const CONFIG_FILES = [
  "global.yaml",
  "provider.yaml",
  "models.yaml",
  "mcp.yaml",
  "env.yaml",
  "agents.yaml",
  "plugins.yaml",
] as const;

export async function loadValidatedConfig(configDir: string): Promise<ConfigSet> {
  return (await loadValidatedConfigWithTrace(configDir)).config;
}

export type ConfigProvenance = {
  global: Record<string, string>;
  providers: Record<string, string>;
  models: Record<string, string>;
  mcp: Record<string, string>;
  env: Record<string, string>;
  agents: Record<string, string>;
  plugins: Record<string, string>;
};

export type LoadedValidatedConfig = {
  config: ConfigSet;
  provenance: ConfigProvenance;
  baseFiles: string[];
  overlays: string[];
};

export async function loadValidatedConfigWithTrace(configDir: string): Promise<LoadedValidatedConfig> {
  const [global, providers, models, mcp, env, agents, plugins] = await Promise.all([
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[0]),
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[1]),
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[2]),
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[3]),
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[4]),
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[5]),
    loadConfigYamlWithTrace(configDir, CONFIG_FILES[6]),
  ]);
  const result = validateConfigSet({
    global: global.value,
    providers: providers.value,
    models: models.value,
    mcp: mcp.value,
    env: env.value,
    agents: agents.value,
    plugins: plugins.value,
  });
  if (!result.ok) throw new ConfigValidationError(result.errors);
  const loaded = [global, providers, models, mcp, env, agents, plugins];
  return {
    config: result.config,
    provenance: {
      global: global.sources,
      providers: providers.sources,
      models: models.sources,
      mcp: mcp.sources,
      env: env.sources,
      agents: agents.sources,
      plugins: plugins.sources,
    },
    baseFiles: loaded.map((entry) => entry.base),
    overlays: loaded.flatMap((entry) => (entry.overlay ? [entry.overlay] : [])),
  };
}

export class ConfigValidationError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super(`YAML 配置校验失败（${errors.length} 个错误）。`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

export function formatValidationError(error: ValidationError): string {
  return `[${error.file}] ${error.message}（${error.path}）`;
}

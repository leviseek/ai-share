import { loadConfigYaml } from "./local-overlay.ts";
import { validateConfigSet, type ConfigSet, type ValidationError } from "./validation.ts";

const CONFIG_FILES = ["global.yaml", "provider.yaml", "models.yaml", "mcp.yaml", "env.yaml"] as const;

export async function loadValidatedConfig(configDir: string): Promise<ConfigSet> {
  const [global, providers, models, mcp, env] = await Promise.all(
    CONFIG_FILES.map((fileName) => loadConfigYaml(configDir, fileName)),
  );
  const result = validateConfigSet({ global, providers, models, mcp, env });
  if (!result.ok) throw new ConfigValidationError(result.errors);
  return result.config;
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

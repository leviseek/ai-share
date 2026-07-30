import { isSensitiveName, looksLikeSecretLiteral } from "../../security/secret-patterns.ts";
import { isRecord, type ValidationError } from "./common.ts";

const DISALLOWED_CODEX_ENV_KEYS = new Set(["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "PATH", "PATHEXT"]);

export function validateCodexEnv(errors: ValidationError[], envConfig: unknown): void {
  const variables = isRecord(envConfig) ? envConfig.variables : undefined;
  if (!isRecord(variables)) return;

  for (const [envName, envValue] of Object.entries(variables)) {
    if (isGeneratorManagedEnvName(envName)) {
      errors.push({
        file: "env.yaml",
        path: `variables.${envName}`,
        message: `env '${envName}' 不应写入 Codex .env；请保留给系统环境或生成器参数管理`,
      });
    }

    if (isSensitiveName(envName)) {
      errors.push({
        file: "env.yaml",
        path: `variables.${envName}`,
        message: `env '${envName}' 看起来是敏感变量，不允许通过 config/env.yaml 写入 Codex .env`,
      });
    }

    if (typeof envValue === "string" && looksLikeSecretLiteral(envValue)) {
      errors.push({
        file: "env.yaml",
        path: `variables.${envName}`,
        message: `env '${envName}' 疑似包含明文 secret，不允许写入 config/env.yaml`,
      });
    }
  }
}

function isGeneratorManagedEnvName(envName: string): boolean {
  const normalized = envName.toUpperCase();
  return (
    DISALLOWED_CODEX_ENV_KEYS.has(normalized) ||
    normalized.endsWith("_HOME") ||
    normalized.endsWith("_PATH") ||
    normalized.startsWith("AI_SHARE_") ||
    normalized.startsWith("CODEX_")
  );
}

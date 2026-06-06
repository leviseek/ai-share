import { ENV_NAME_PATTERN, ENV_REFERENCE_PATTERN, MODEL_ROLES } from "../schema-spec.ts";

const envNameRegex = new RegExp(ENV_NAME_PATTERN);
const envReferenceRegex = new RegExp(ENV_REFERENCE_PATTERN);

export type ValidationError = {
  file: string;
  path: string;
  message: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateOptionalString(errors: ValidationError[], file: string, path: string, value: unknown): void {
  if (value !== undefined && (typeof value !== "string" || !value)) {
    errors.push({
      file,
      path,
      message: `${path} 必须是非空字符串`,
    });
  }
}

export function validateOptionalNumber(errors: ValidationError[], file: string, path: string, value: unknown): void {
  if (value !== undefined && !isFiniteNumber(value)) {
    errors.push({
      file,
      path,
      message: `${path} 必须是数字`,
    });
  }
}

export function validateOptionalBoolean(errors: ValidationError[], file: string, path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push({
      file,
      path,
      message: `${path} 必须是布尔值`,
    });
  }
}

export function isModelRole(value: string): boolean {
  return MODEL_ROLES.includes(value as (typeof MODEL_ROLES)[number]);
}

export function isEnvName(value: string): boolean {
  return envNameRegex.test(value);
}

export function isEnvReference(value: string): boolean {
  return envReferenceRegex.test(value);
}

export function isSensitiveName(value: string): boolean {
  return /(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTH|BEARER|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)/i.test(value);
}

export function looksLikeSecretLiteral(value: string): boolean {
  return /^(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]{20,}|SEC[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(
    value,
  );
}

const envReferenceRegex = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;

export function envReferenceName(value: string | undefined): string | undefined {
  return envReferenceRegex.exec(value ?? "")?.[1];
}

export function requireEnvReferenceName(value: string | undefined, label: string): string {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  const envName = envReferenceName(value);
  if (!envName) throw new Error(`${label} 必须使用 \${ENV_NAME} 格式：${value}`);
  return envName;
}

export function isEnvReference(value: string): boolean {
  return envReferenceName(value) !== undefined;
}

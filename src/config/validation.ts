export function requireString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

export function requireRecord<T>(value: Record<string, T> | undefined, label: string): Record<string, T> {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

export function requireValue<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`缺少必要配置字段：${label}`);
  return value;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

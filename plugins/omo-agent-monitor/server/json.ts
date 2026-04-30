export function parseJson(value: string): Record<string, any> | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

export function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

export function booleanField(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "boolean" ? field : undefined;
}

export function firstRecord(...values: unknown[]): Record<string, any> | undefined {
  return values.find((value) => isRecord(value));
}

export function setOptionalString<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete target[key];
    return;
  }
  target[key] = value as T[K];
}

export type YamlObject = Record<string, unknown>;

export function parseYamlObject(text: string, label = "YAML"): YamlObject {
  let value: unknown;
  try {
    value = Bun.YAML.parse(text);
  } catch (error) {
    throw new Error(`${label} YAML 解析失败：${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  if (!isPlainRecord(value)) {
    throw new Error(`${label} 根节点必须是对象。`);
  }
  return value;
}

function isPlainRecord(value: unknown): value is YamlObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

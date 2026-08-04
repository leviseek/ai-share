import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WezTermConfig } from "../types.ts";
import { parseYamlObject } from "../yaml.ts";
import { validateYamlSchemaShape } from "./validators/schema-shape.ts";

export async function loadWezTermConfig(configDir: string): Promise<WezTermConfig> {
  const path = resolve(configDir, "wezterm.yaml");
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`读取 WezTerm YAML 配置失败：${path}`, { cause: error });
  }
  const value: unknown = parseYamlObject(content, path);
  const errors = validateYamlSchemaShape("wezterm.yaml", value);
  if (errors.length > 0) {
    throw new Error(`WezTerm YAML 配置校验失败：${errors.map((error) => error.message).join("；")}`);
  }
  return value as WezTermConfig;
}

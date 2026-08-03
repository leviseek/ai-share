import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WezTermConfig } from "../types.ts";
import { parseYamlObject } from "../yaml.ts";
import { validateYamlSchemaShape } from "./validators/schema-shape.ts";

export async function loadWezTermConfig(configDir: string): Promise<WezTermConfig> {
  const path = resolve(configDir, "wezterm.yaml");
  const value: unknown = parseYamlObject(await readFile(path, "utf8"), path);
  const errors = validateYamlSchemaShape("wezterm.yaml", value);
  if (errors.length > 0) {
    throw new Error(`WezTerm YAML 配置校验失败：${errors.map((error) => error.message).join("；")}`);
  }
  return value as WezTermConfig;
}

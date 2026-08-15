import { resolve } from "node:path";
import { ARCHIFY_DEFAULT_REF, ARCHIFY_DEFAULT_REPO, ARCHIFY_DEFAULT_SKILL } from "./schema-spec.ts";
import { loadConfigYamlWithTrace } from "./local-overlay.ts";
import { validateYamlSchemaShape, type YamlSchemaInput } from "./validators/schema-shape.ts";
import { pathExists } from "../cli/fs.ts";
import type { ArchifyYaml } from "../types.ts";

export const DEFAULT_ARCHIFY_CONFIG: ArchifyYaml = {
  archify: {
    repo: ARCHIFY_DEFAULT_REPO,
    skill: ARCHIFY_DEFAULT_SKILL,
    ref: ARCHIFY_DEFAULT_REF,
    enabled: true,
  },
};

export type LoadedArchifyConfig = {
  config: ArchifyYaml;
  sources: Record<string, string>;
  base?: string;
  overlay?: string;
};

export async function loadArchifyConfig(configDir: string): Promise<ArchifyYaml> {
  return (await loadArchifyConfigWithTrace(configDir)).config;
}

export async function loadArchifyConfigWithTrace(configDir: string): Promise<LoadedArchifyConfig> {
  const basePath = resolve(configDir, "archify.yaml");
  if (!(await pathExists(basePath))) return { config: structuredClone(DEFAULT_ARCHIFY_CONFIG), sources: {} };

  const loaded = await loadConfigYamlWithTrace(configDir, "archify.yaml");
  const errors = validateYamlSchemaShape("archify.yaml", loaded.value);
  if (errors.length > 0) {
    throw new Error(
      `Archify YAML 配置校验失败：${errors.map((error) => `${error.message}（${error.path}）`).join("；")}`,
    );
  }
  return {
    config: loaded.value as ArchifyYaml,
    sources: loaded.sources,
    base: loaded.base,
    ...(loaded.overlay ? { overlay: loaded.overlay } : {}),
  };
}

export function archifySchemaInput(config: ArchifyYaml | undefined): YamlSchemaInput["archify.yaml"] {
  return config ?? DEFAULT_ARCHIFY_CONFIG;
}

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseYamlObject } from "../yaml.ts";
import { pathExists } from "../cli/fs.ts";

export type LoadedConfigYamlTrace = {
  value: object;
  sources: Record<string, string>;
  base: string;
  overlay?: string;
};

export async function loadConfigYaml(configDir: string, fileName: string): Promise<object> {
  return (await loadConfigYamlWithTrace(configDir, fileName)).value;
}

export async function loadConfigYamlWithTrace(configDir: string, fileName: string): Promise<LoadedConfigYamlTrace> {
  const basePath = resolve(configDir, fileName);
  const base = parseYamlObject(await readFile(basePath, "utf8"), basePath);
  const baseSource = `config/${fileName}`;
  const sources: Record<string, string> = {};
  collectValueSources(base, "", baseSource, sources);
  const overlayPath = resolve(configDir, "local", fileName);
  if (!(await pathExists(overlayPath))) return { value: base, sources, base: baseSource };
  const overlay = parseYamlObject(await readFile(overlayPath, "utf8"), overlayPath);
  const overlaySource = `config/local/${fileName}`;
  applyOverlaySources(base, overlay, "", overlaySource, sources);
  return {
    value: mergeLocalOverlay(base, overlay) as object,
    sources,
    base: baseSource,
    overlay: overlaySource,
  };
}

export function mergeLocalOverlay(base: unknown, overlay: unknown): unknown {
  if (!isPlainRecord(base) || !isPlainRecord(overlay)) return overlay;

  const output: Record<string, unknown> = { ...base };
  for (const [key, overlayValue] of Object.entries(overlay)) {
    const baseValue = output[key];
    output[key] =
      isPlainRecord(baseValue) && isPlainRecord(overlayValue)
        ? mergeLocalOverlay(baseValue, overlayValue)
        : overlayValue;
  }
  return output;
}

export async function listLocalConfigOverlays(configDir: string): Promise<string[]> {
  const localDir = resolve(configDir, "local");
  if (!(await pathExists(localDir))) return [];
  const entries = await readdir(localDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:ya?ml)$/i.test(entry.name))
    .map((entry) => `config/local/${entry.name}`)
    .sort();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyOverlaySources(
  base: unknown,
  overlay: unknown,
  path: string,
  overlaySource: string,
  sources: Record<string, string>,
): void {
  if (isPlainRecord(base) && isPlainRecord(overlay)) {
    for (const [key, overlayValue] of Object.entries(overlay)) {
      const childPath = joinFieldPath(path, key);
      const baseValue = base[key];
      if (isPlainRecord(baseValue) && isPlainRecord(overlayValue)) {
        applyOverlaySources(baseValue, overlayValue, childPath, overlaySource, sources);
      } else {
        deleteSourceSubtree(sources, childPath);
        collectValueSources(overlayValue, childPath, overlaySource, sources);
      }
    }
    return;
  }

  deleteSourceSubtree(sources, path);
  collectValueSources(overlay, path, overlaySource, sources);
}

function collectValueSources(value: unknown, path: string, source: string, output: Record<string, string>): void {
  if (isPlainRecord(value) && Object.keys(value).length > 0) {
    for (const [key, child] of Object.entries(value)) {
      collectValueSources(child, joinFieldPath(path, key), source, output);
    }
    return;
  }
  output[path || "$"] = source;
}

function deleteSourceSubtree(sources: Record<string, string>, path: string): void {
  const normalizedPath = path || "$";
  for (const key of Object.keys(sources)) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}.`)) Reflect.deleteProperty(sources, key);
  }
}

function joinFieldPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

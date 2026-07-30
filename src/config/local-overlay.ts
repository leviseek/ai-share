import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseYamlObject } from "../yaml.ts";
import { pathExists } from "../cli/fs.ts";

export async function loadConfigYaml(configDir: string, fileName: string): Promise<object> {
  const basePath = resolve(configDir, fileName);
  const base = parseYamlObject(await readFile(basePath, "utf8"), basePath);
  const overlayPath = resolve(configDir, "local", fileName);
  if (!(await pathExists(overlayPath))) return base;
  const overlay = parseYamlObject(await readFile(overlayPath, "utf8"), overlayPath);
  return mergeLocalOverlay(base, overlay) as object;
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

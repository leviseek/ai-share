import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseYamlObject } from "../yaml.ts";

export async function loadConfigYaml(configDir: string, fileName: string): Promise<object> {
  const base = parseYamlObject(await readFile(resolve(configDir, fileName), "utf8"));
  const overlayPath = resolve(configDir, "local", fileName);
  if (!existsSync(overlayPath)) return base;
  const overlay = parseYamlObject(await readFile(overlayPath, "utf8"));
  return mergeLocalOverlay(base, overlay) as object;
}

export function loadConfigYamlSync(configDir: string, fileName: string): object {
  const base = parseYamlObject(readFileSync(resolve(configDir, fileName), "utf8"));
  const overlayPath = resolve(configDir, "local", fileName);
  if (!existsSync(overlayPath)) return base;
  const overlay = parseYamlObject(readFileSync(overlayPath, "utf8"));
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

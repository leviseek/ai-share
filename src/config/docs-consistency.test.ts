import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelsYaml, ProfilesYaml } from "../types.ts";
import { parseYamlObject } from "../yaml.ts";

const projectRoot = resolve(import.meta.dir, "..", "..");

describe("documentation and memory consistency", () => {
  test("keeps model catalog tables aligned with config/models.yaml", () => {
    const models = loadYaml("models.yaml") as ModelsYaml;
    const schemaDoc = readText("docs/schema/models.md");
    const memoryDoc = readText("memory/stack/models.md");

    for (const [modelId, model] of Object.entries(models)) {
      const providerGroup = requiredString(model.provider_group, `${modelId}.provider_group`);
      const contextWindow = formatTokenCount(
        requiredNumber(model.limits?.context_window, `${modelId}.limits.context_window`),
      );
      const inputCost = formatNumber(requiredNumber(model.cost?.input, `${modelId}.cost.input`));
      const outputCost = formatNumber(requiredNumber(model.cost?.output, `${modelId}.cost.output`));

      expect(schemaDoc).toMatch(
        tableRowPattern([`\`${modelId}\``, providerGroup, contextWindow, `$${inputCost} / $${outputCost}`]),
      );
      expect(memoryDoc).toMatch(tableRowPattern([modelId, contextWindow, inputCost]));
    }
  });

  test("keeps profile role mapping tables aligned with config/profiles.yaml", () => {
    const profiles = loadYaml("profiles.yaml") as ProfilesYaml;
    const schemaDoc = readText("docs/schema/profiles.md");
    const triRoleDoc = readText("docs/protocol/tri-role.md");
    const readme = readText("README.md");
    const memoryDoc = readText("memory/stack/models.md");

    for (const [profileId, profile] of Object.entries(profiles)) {
      const primary = requiredString(profile.models?.primary, `${profileId}.models.primary`);
      const reasoning = requiredString(profile.models?.reasoning, `${profileId}.models.reasoning`);
      const fast = requiredString(profile.models?.fast, `${profileId}.models.fast`);

      expect(schemaDoc).toMatch(tableRowPattern([`\`${profileId}\``, primary, reasoning, fast]));
      expect(triRoleDoc).toMatch(tableRowPattern([`\`${profileId}\``, primary, reasoning, fast], 1));
      expect(memoryDoc).toMatch(tableRowPattern([profileId, primary, reasoning, fast]));
      expect(readme).toContain(`${profileId}：primary=${primary}，reasoning=${reasoning}，fast=${fast}`);
    }
  });
});

function loadYaml(fileName: string): unknown {
  return parseYamlObject(readFileSync(resolve(projectRoot, "config", fileName), "utf8"));
}

function readText(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function tableRowPattern(cells: readonly string[], wildcardCells = 0): RegExp {
  const escapedCells = cells.map((cell) => escapeRegExp(cell));
  const firstCell = escapedCells[0];
  if (!firstCell) throw new Error("tableRowPattern requires at least one cell");
  const pattern = [
    "\\|\\s*",
    firstCell,
    "\\s*\\|",
    ...Array.from({ length: wildcardCells }, () => "[^\\n|]*\\|"),
    ...escapedCells.slice(1).map((cell) => `\\s*${cell}\\s*\\|`),
  ].join("");
  return new RegExp(pattern);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`缺少字符串字段：${label}`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`缺少数字字段：${label}`);
  return value;
}

function formatNumber(value: number): string {
  return String(value);
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`;
  return String(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

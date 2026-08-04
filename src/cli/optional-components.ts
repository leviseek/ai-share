import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hasManagedSkillMarker } from "./generation-plan.ts";
import { SUPERPOWERS_PLUGIN_SPEC } from "./install-plan.ts";
import type { InstallChoice } from "./install-select.ts";
import { nativeSkillNames } from "./native-skills.ts";
import type { GeneratorPaths } from "./paths.ts";

export type OptionalComponentKind = "tool" | "agent" | "skill";

export type OptionalComponentState = {
  superpowers: boolean;
  agents: ReadonlySet<string>;
  skills: ReadonlySet<string>;
};

export function buildOptionalComponentChoices(input: {
  agentIds: readonly string[];
  skillNames: readonly string[];
  state: OptionalComponentState;
}): InstallChoice[] {
  const choices: InstallChoice[] = [];
  choices.push({
    id: SUPERPOWERS_PLUGIN_SPEC,
    label: "Superpowers",
    kind: "tool",
    required: false,
    selected: input.state.superpowers,
    status: input.state.superpowers ? "已启用" : "未启用",
  });
  for (const agentId of [...input.agentIds].sort()) {
    const selected = input.state.agents.has(agentId);
    choices.push({
      id: agentId,
      label: agentId,
      kind: "agent",
      required: false,
      selected,
      status: selected ? "已启用" : "未启用",
    });
  }
  for (const skillName of [...input.skillNames].sort()) {
    const selected = input.state.skills.has(skillName);
    choices.push({
      id: skillName,
      label: skillName,
      kind: "skill",
      required: false,
      selected,
      status: selected ? "已启用" : "未启用",
    });
  }
  return choices;
}

export function parseOptionalSelection(
  selectedIds: ReadonlySet<string>,
  skillNames: ReadonlySet<string>,
): OptionalComponentState {
  const agents = new Set<string>();
  const skills = new Set<string>();
  let superpowers = false;
  for (const id of selectedIds) {
    if (id === SUPERPOWERS_PLUGIN_SPEC) superpowers = true;
    else if (skillNames.has(id)) skills.add(id);
    else agents.add(id);
  }
  return { superpowers, agents, skills };
}

export async function readTargetOptionalState(
  paths: GeneratorPaths,
  fallback: { agentIds: readonly string[]; skillNames: readonly string[] },
): Promise<OptionalComponentState> {
  const parsed = await readTargetOpenCodeConfig(paths.targetOpenCodeConfig);
  if (parsed === undefined) {
    return { superpowers: false, agents: new Set(fallback.agentIds), skills: new Set(fallback.skillNames) };
  }
  const superpowers =
    isRecord(parsed) && Array.isArray(parsed.plugin) && parsed.plugin.includes(SUPERPOWERS_PLUGIN_SPEC);
  const agents = new Set<string>();
  const skills = new Set<string>();
  if (isRecord(parsed) && isRecord(parsed.agent)) {
    for (const agentId of Object.keys(parsed.agent)) agents.add(agentId);
  }
  for (const skillName of nativeSkillNames()) {
    if (await hasManagedSkillMarker(resolve(paths.targetOpenCodeSkillsDir, skillName))) skills.add(skillName);
  }
  return { superpowers, agents, skills };
}

async function readTargetOpenCodeConfig(path: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw new Error(`读取目标 OpenCode 配置失败：${path}（${describeError(error)}）`, { cause: error });
  }
  try {
    return JSON.parse(stripJsoncLineComments(content));
  } catch (error) {
    throw new Error(`目标 OpenCode 配置解析失败：${path}（${describeError(error)}）`, { cause: error });
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripJsoncLineComments(content: string): string {
  return content
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

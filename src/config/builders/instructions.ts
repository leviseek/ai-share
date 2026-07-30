import { resolve } from "node:path";
import { searchMemoryDetailed, type MemorySearchDetails } from "../../memory/retrieval.ts";

export type InstructionsSelection = {
  paths: string[];
  fixedPaths: string[];
  memory: MemorySearchDetails;
};

export function buildInstructionsPaths(projectRoot: string, taskDescription?: string): string[] {
  return buildInstructionsSelection(projectRoot, taskDescription).paths;
}

export function buildInstructionsSelection(projectRoot: string, taskDescription?: string): InstructionsSelection {
  const memoryBase = resolve(projectRoot, "memory");
  const memory = searchMemoryDetailed(taskDescription ?? "", projectRoot);
  const leadingFixedPaths = [
    resolve(projectRoot, "AI_GUIDELINES.md"),
    resolve(memoryBase, "policies", "ai-execution-contract.md"),
    resolve(memoryBase, "policies", "memory-lifecycle.md"),
  ];
  const trailingFixedPaths = [
    resolve(memoryBase, "stable", "user.yaml"),
    resolve(memoryBase, "stable", "workflows.yaml"),
    resolve(memoryBase, "stable", "devices.yaml"),
  ];
  const fixedPaths = [...leadingFixedPaths, ...trailingFixedPaths];
  return {
    paths: [
      ...new Set([
        ...leadingFixedPaths,
        ...memory.selected.map((result) => resolve(projectRoot, result.path)),
        ...trailingFixedPaths,
      ]),
    ],
    fixedPaths,
    memory,
  };
}

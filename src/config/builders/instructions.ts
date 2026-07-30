import { resolve } from "node:path";
import { searchMemory } from "../../memory/retrieval.ts";

export function buildInstructionsPaths(projectRoot: string, taskDescription?: string): string[] {
  const memoryBase = resolve(projectRoot, "memory");
  const taskMemories = taskDescription
    ? searchMemory(taskDescription, projectRoot)
        .slice(0, 3)
        .map((result) => resolve(projectRoot, result.path))
    : [];
  return [
    ...new Set([
      resolve(projectRoot, "AI_GUIDELINES.md"),
      resolve(memoryBase, "policies", "ai-execution-contract.md"),
      resolve(memoryBase, "policies", "memory-lifecycle.md"),
      ...taskMemories,
      resolve(memoryBase, "stable", "user.yaml"),
      resolve(memoryBase, "stable", "workflows.yaml"),
      resolve(memoryBase, "stable", "devices.yaml"),
    ]),
  ];
}

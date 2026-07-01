import { resolve } from "node:path";
import { searchMemory } from "../../memory/retrieval.ts";

export function buildInstructionsPaths(projectRoot: string, taskDescription?: string): string[] {
  const memoryBase = resolve(projectRoot, "memory");

  const taskMemories: string[] = [];
  const effectiveTask = taskDescription ?? process.env.AI_SHARE_TASK;
  if (effectiveTask) {
    const results = searchMemory(effectiveTask, projectRoot);
    taskMemories.push(...results.slice(0, 3).map((r) => resolve(projectRoot, r.path)));
  }

  return [
    resolve(projectRoot, "AI_GUIDELINES.md"),
    ...taskMemories,
    resolve(memoryBase, "policies", "ai-execution-contract.md"),
    resolve(memoryBase, "policies", "memory-lifecycle.md"),
    resolve(memoryBase, "user", "profile.md"),
    resolve(memoryBase, "user", "profile.yaml"),
    resolve(memoryBase, "user", "workflow.md"),
    resolve(memoryBase, "user", "workflows.yaml"),
    resolve(memoryBase, "user", "preferences.md"),
    resolve(memoryBase, "user", "devices.md"),
    resolve(memoryBase, "user", "devices.yaml"),
    resolve(memoryBase, "user", "toolchain.md"),
    resolve(memoryBase, "user", "prompts.md"),
    resolve(memoryBase, "user", "models.yaml"),
    resolve(memoryBase, "architecture", "coding-philosophy.md"),
    resolve(memoryBase, "architecture", "ai-desktop.md"),
    resolve(memoryBase, "stack", "wsl.md"),
    resolve(memoryBase, "stack", "models.md"),
    resolve(memoryBase, "stable", "user.yaml"),
    resolve(memoryBase, "stable", "workflows.yaml"),
    resolve(memoryBase, "stable", "devices.yaml"),
  ];
}

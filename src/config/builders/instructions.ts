import { resolve } from "node:path";
import { getMemoryFilesForProfile } from "../../loaders/memory-loader.ts";
import { searchMemory } from "../../memory/retrieval.ts";

export function buildInstructionsPaths(projectRoot: string, profile?: string, taskDescription?: string): string[] {
  const memoryBase = resolve(projectRoot, "memory");

  // Task-based memory retrieval: top 3 relevant memory files prepended for priority
  const taskMemories: string[] = [];
  const effectiveTask = taskDescription ?? process.env.AI_SHARE_TASK;
  if (effectiveTask) {
    const results = searchMemory(effectiveTask, projectRoot);
    taskMemories.push(...results.slice(0, 3).map((r) => resolve(projectRoot, r.path)));
  }

  return [
    resolve(projectRoot, "AI_GUIDELINES.md"),
    // Task-specific memories (top priority, inserted before structured memory)
    ...taskMemories,
    // memory/user/
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
    // memory/architecture/
    resolve(memoryBase, "architecture", "coding-philosophy.md"),
    resolve(memoryBase, "architecture", "agent-patterns.md"),
    resolve(memoryBase, "architecture", "ai-desktop.md"),
    // memory/stack/
    resolve(memoryBase, "stack", "wsl.md"),
    resolve(memoryBase, "stack", "models.md"),
    // profile-specific memory
    ...(profile ? getMemoryFilesForProfile(profile, projectRoot) : []),
  ];
}

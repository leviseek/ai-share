import { writeFileSync } from "node:fs";
import type { TriRoleProfile } from "../tri-role.ts";

function generateInstructionsSection(profile: TriRoleProfile, memoryFiles: string[]): string {
  const lines: string[] = [
    `- Use ${profile.roles.primary.model} for primary coding tasks`,
    `- Use ${profile.roles.reasoning.model} for deep analysis and reasoning`,
    `- Use ${profile.roles.fast.model} for lightweight and search tasks`,
    `- Context budget: ${profile.compaction?.max_input_tokens ?? "default"}`,
  ];

  if (memoryFiles.length > 0) {
    lines.push("- Memory files: " + memoryFiles.map((f) => `\`${f}\``).join(", "));
  }

  return lines.join("\n");
}

function generateCompactionSection(profile: TriRoleProfile): string {
  if (!profile.compaction) return "";

  const parts: string[] = [];

  if (profile.compaction.threshold) {
    parts.push(`- Threshold: ${profile.compaction.threshold} tokens`);
  }
  if (profile.compaction.max_input_tokens) {
    parts.push(`- Max input: ${profile.compaction.max_input_tokens} tokens`);
  }
  if (profile.compaction.model_role) {
    parts.push(`- Compaction model role: ${profile.compaction.model_role}`);
  }

  return parts.length > 0 ? parts.join("\n") : "";
}

export function generateClaudeMd(profile: TriRoleProfile, memoryFiles: string[]): string {
  return `# CLAUDE.md

## Project Configuration
Generated from ai-share tri-role protocol.

## Profile
- **Profile**: ${profile.profile_id}${profile.name ? ` (${profile.name})` : ""}
- **Primary Model**: ${profile.roles.primary.model}
- **Reasoning Model**: ${profile.roles.reasoning.model}
- **Fast Model**: ${profile.roles.fast.model}

## Instructions
${generateInstructionsSection(profile, memoryFiles)}

## Compaction
${generateCompactionSection(profile)}
`;
}

export function writeClaudeMd(profile: TriRoleProfile, memoryFiles: string[], outputPath: string): void {
  const content = generateClaudeMd(profile, memoryFiles);

  writeFileSync(outputPath, content, "utf8");
}

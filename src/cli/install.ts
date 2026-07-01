import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { pathExists, writeText } from "./fs.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";

export type TextFileWriter = (path: string, content: string) => Promise<void>;

export function installLaunchers(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`不再安装自定义启动命令；请直接使用 Codex CLI。用户 bin：${paths.targetBinDir}`);
  }
  return Promise.resolve();
}

export async function installNativeSkills(
  paths: GeneratorPaths,
  dryRun: boolean,
  force: boolean,
  writer?: TextFileWriter,
): Promise<void> {
  if (dryRun) {
    for (const nativeSkill of NATIVE_SKILLS) {
      const skillPath = nativeSkillPath(paths, nativeSkill.name);
      console.log(`\n--- ${skillPath} ---\n${nativeSkill.content}`);
    }
    return;
  }

  for (const nativeSkill of NATIVE_SKILLS) {
    const skillPath = nativeSkillPath(paths, nativeSkill.name);
    if (!force && (await pathExists(skillPath))) {
      throw new Error(`目标已存在：${skillPath}\n如需覆盖，请运行：bun run ai:gen -- --force`);
    }
  }

  for (const nativeSkill of NATIVE_SKILLS) {
    const targetDir = resolve(paths.targetCodexSkillsDir, nativeSkill.name);
    const targetPath = resolve(targetDir, "SKILL.md");
    if (writer) {
      await writer(targetPath, nativeSkill.content);
      continue;
    }
    await mkdir(targetDir, { recursive: true });
    await writeText(targetPath, nativeSkill.content, { dryRun: false, force: true });
  }
}

function nativeSkillPath(paths: GeneratorPaths, skillName: string): string {
  return resolve(paths.targetCodexSkillsDir, skillName, "SKILL.md");
}

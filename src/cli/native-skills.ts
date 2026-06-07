import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

export type NativeSkill = {
  name: string;
  content: string;
};

const SKILLS_SOURCE_DIR = resolve(import.meta.dir, "..", "..", "skills");

export const NATIVE_SKILLS: NativeSkill[] = listNativeSkillSourceDirs().map((skillDir) => {
  const name = basename(skillDir);
  return {
    name,
    content: readNativeSkill(skillDir),
  };
});

export function nativeSkillNames(): string[] {
  return NATIVE_SKILLS.map((nativeSkill) => nativeSkill.name);
}

function listNativeSkillSourceDirs(): string[] {
  return readdirSync(SKILLS_SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(SKILLS_SOURCE_DIR, entry.name))
    .sort();
}

function readNativeSkill(skillDir: string): string {
  return readFileSync(resolve(skillDir, "SKILL.md"), "utf8");
}

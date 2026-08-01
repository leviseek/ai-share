import { isAbsolute, resolve } from "node:path";

export type GeneratorPaths = {
  projectRoot: string;
  configDir: string;
  homeDir: string;
  targetCodexConfigDir: string;
  targetCodexConfig: string;
  targetCodexEnv: string;
  targetCodexInstructions: string;
  targetCodexSkillsDir: string;
  targetCodexAgentsDir: string;
};

export function buildGeneratorPaths(
  projectRoot: string = resolve(import.meta.dir, "..", ".."),
  env: Record<string, string | undefined> = Bun.env,
): GeneratorPaths {
  const configDir = resolve(projectRoot, "config");
  const homeValue = env.HOME ?? env.USERPROFILE;
  if (!homeValue?.trim()) throw new Error("无法解析用户目录。请设置 HOME 或 USERPROFILE 环境变量。");
  if (!isAbsolute(homeValue)) throw new Error("HOME 或 USERPROFILE 必须是绝对路径。");
  const homeDir = resolve(homeValue);
  const codexHomeValue = env.CODEX_HOME;
  if (codexHomeValue !== undefined && (!codexHomeValue.trim() || !isAbsolute(codexHomeValue))) {
    throw new Error("CODEX_HOME 必须是非空绝对路径。");
  }
  const targetCodexConfigDir = resolve(codexHomeValue ?? resolve(homeDir, ".codex"));

  return {
    projectRoot,
    configDir,
    homeDir,
    targetCodexConfigDir,
    targetCodexConfig: resolve(targetCodexConfigDir, "config.toml"),
    targetCodexEnv: resolve(targetCodexConfigDir, ".env"),
    targetCodexInstructions: resolve(targetCodexConfigDir, "AGENTS.md"),
    targetCodexSkillsDir: resolve(targetCodexConfigDir, "skills"),
    targetCodexAgentsDir: resolve(targetCodexConfigDir, "agents"),
  };
}

import { isAbsolute, resolve } from "node:path";

export type GeneratorPaths = {
  projectRoot: string;
  configDir: string;
  homeDir: string;
  targetOpenCodeConfigDir: string;
  targetOpenCodeConfig: string;
  targetOpenCodeEnv: string;
  targetOpenCodeSkillsDir: string;
  targetUserBinDir: string;
  targetAiocScript: string;
  targetAiocUnix: string;
  targetAiocCmd: string;
  targetAiocPowerShell: string;
};

export type WezTermPaths = {
  homeDir: string;
  targetWezTermConfigDir: string;
  targetWezTermConfig: string;
};

export function buildGeneratorPaths(
  projectRoot: string = resolve(import.meta.dir, "..", ".."),
  env: Record<string, string | undefined> = Bun.env,
): GeneratorPaths {
  const configDir = resolve(projectRoot, "config");
  const homeDir = resolveHomeDir(env);
  const openCodeConfigDirValue = env.OPENCODE_CONFIG_DIR;
  if (openCodeConfigDirValue !== undefined && (!openCodeConfigDirValue.trim() || !isAbsolute(openCodeConfigDirValue))) {
    throw new Error("OPENCODE_CONFIG_DIR 必须是非空绝对路径。");
  }
  const targetOpenCodeConfigDir = resolve(openCodeConfigDirValue ?? resolve(homeDir, ".config", "opencode"));
  const targetUserBinDir = resolve(homeDir, ".local", "bin");

  return {
    projectRoot,
    configDir,
    homeDir,
    targetOpenCodeConfigDir,
    targetOpenCodeConfig: resolve(targetOpenCodeConfigDir, "opencode.jsonc"),
    targetOpenCodeEnv: resolve(targetOpenCodeConfigDir, ".env"),
    targetOpenCodeSkillsDir: resolve(targetOpenCodeConfigDir, "skills"),
    targetUserBinDir,
    targetAiocScript: resolve(targetUserBinDir, "aioc.ts"),
    targetAiocUnix: resolve(targetUserBinDir, "aioc"),
    targetAiocCmd: resolve(targetUserBinDir, "aioc.cmd"),
    targetAiocPowerShell: resolve(targetUserBinDir, "aioc.ps1"),
  };
}

export function buildWezTermPaths(env: Record<string, string | undefined> = Bun.env): WezTermPaths {
  const homeDir = resolveHomeDir(env);
  const targetWezTermConfigDir = resolve(homeDir, ".config", "wezterm");
  return {
    homeDir,
    targetWezTermConfigDir,
    targetWezTermConfig: resolve(targetWezTermConfigDir, "wezterm.lua"),
  };
}

function resolveHomeDir(env: Record<string, string | undefined>): string {
  const homeValue = env.HOME ?? env.USERPROFILE;
  if (!homeValue?.trim()) throw new Error("无法解析用户目录。请设置 HOME 或 USERPROFILE 环境变量。");
  if (!isAbsolute(homeValue)) throw new Error("HOME 或 USERPROFILE 必须是绝对路径。");
  return resolve(homeValue);
}

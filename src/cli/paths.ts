import { resolve } from "node:path";

export type GeneratorPaths = {
  projectRoot: string;
  configDir: string;
  aiWorkspaceDir: string;
  workspaceAiShareDir: string;
  homeDir: string;
  targetCodexConfigDir: string;
  targetCodexConfig: string;
  targetCodexEnv: string;
  targetCodexInstructions: string;
  targetRuntimeManifest: string;
  targetCodexSkillsDir: string;
};

export function buildGeneratorPaths(projectRoot: string = resolve(import.meta.dir, "..", "..")): GeneratorPaths {
  const configDir = resolve(projectRoot, "config");
  const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
  const aiWorkspaceDir = resolve(homeDir, "ai-workspace");
  const workspaceAiShareDir = resolve(aiWorkspaceDir, "ai-share");
  const targetCodexConfigDir = resolve(Bun.env.CODEX_HOME ?? resolve(homeDir, ".codex"));

  if (!targetCodexConfigDir.startsWith(homeDir) && !Bun.env.CODEX_HOME) {
    throw new Error("无法解析用户级 Codex 配置目录。请检查 HOME 或 USERPROFILE 环境变量。");
  }

  return {
    projectRoot,
    configDir,
    aiWorkspaceDir,
    workspaceAiShareDir,
    homeDir,
    targetCodexConfigDir,
    targetCodexConfig: resolve(targetCodexConfigDir, "config.toml"),
    targetCodexEnv: resolve(targetCodexConfigDir, ".env"),
    targetCodexInstructions: resolve(targetCodexConfigDir, "AGENTS.md"),
    targetRuntimeManifest: resolve(targetCodexConfigDir, "ai-share.runtime.json"),
    targetCodexSkillsDir: resolve(targetCodexConfigDir, "skills"),
  };
}

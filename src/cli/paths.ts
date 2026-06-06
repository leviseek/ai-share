import { resolve } from "node:path";

export type GeneratorPaths = {
  projectRoot: string;
  configDir: string;
  binDir: string;
  aiWorkspaceDir: string;
  workspaceAiShareDir: string;
  workspaceAiMemoryDir: string;
  externalAiMemoryDir: string;
  homeDir: string;
  targetCodexConfigDir: string;
  targetCodexAgentDir: string;
  targetCodexConfig: string;
  targetCodexInstructions: string;
  targetOmxConfig: string;
  targetRuntimeManifest: string;
  targetBinDir: string;
  targetCodexSkillsDir: string;
};

export function buildGeneratorPaths(projectRoot: string = resolve(import.meta.dir, "..", "..")): GeneratorPaths {
  const configDir = resolve(projectRoot, "config");
  const binDir = resolve(projectRoot, "bin");
  const homeDir = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "");
  const aiWorkspaceDir = resolve(homeDir, "ai-workspace");
  const workspaceAiShareDir = resolve(aiWorkspaceDir, "ai-share");
  const workspaceAiMemoryDir = resolve(aiWorkspaceDir, "ai-memory");
  const externalAiMemoryDir = resolve(projectRoot, "..", "ai-memory");
  const targetCodexConfigDir = resolve(Bun.env.CODEX_HOME ?? resolve(homeDir, ".codex"));
  const targetCodexAgentDir = resolve(targetCodexConfigDir, "agents");

  if (!targetCodexConfigDir.startsWith(homeDir) && !Bun.env.CODEX_HOME) {
    throw new Error("无法解析用户级 Codex 配置目录。请检查 HOME 或 USERPROFILE 环境变量。");
  }

  return {
    projectRoot,
    configDir,
    binDir,
    aiWorkspaceDir,
    workspaceAiShareDir,
    workspaceAiMemoryDir,
    externalAiMemoryDir,
    homeDir,
    targetCodexConfigDir,
    targetCodexAgentDir,
    targetCodexConfig: resolve(targetCodexConfigDir, "config.toml"),
    targetCodexInstructions: resolve(targetCodexConfigDir, "AGENTS.md"),
    targetOmxConfig: resolve(targetCodexConfigDir, ".omx-config.json"),
    targetRuntimeManifest: resolve(targetCodexConfigDir, "ai-share.runtime.json"),
    targetBinDir: resolve(homeDir, ".local", "bin"),
    targetCodexSkillsDir: resolve(targetCodexConfigDir, "skills"),
  };
}

export function profileCodexConfigPath(targetCodexConfigDir: string, profileId: string): string {
  return resolve(targetCodexConfigDir, `${profileId}.config.toml`);
}

export function profileCodexInstructionsPath(targetCodexConfigDir: string, profileId: string): string {
  return resolve(targetCodexConfigDir, `${profileId}.AGENTS.md`);
}

export function profileOmxConfigPath(targetCodexConfigDir: string, profileId: string): string {
  return resolve(targetCodexConfigDir, `${profileId}.omx-config.json`);
}

export function codexAgentConfigPath(targetCodexAgentDir: string, agentId: string): string {
  return resolve(targetCodexAgentDir, `${agentId}.toml`);
}

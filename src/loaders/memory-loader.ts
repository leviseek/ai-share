import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Profile 到 ai-memory 相对文件路径列表的映射。
 * key 为 OpenCode profile 名称，value 为相对于 ai-memory 仓库根目录的文件路径数组。
 */
export type ProfileMemoryMap = Record<string, readonly string[]>;

/**
 * 各 OpenCode profile 对应的 ai-memory 文件集。
 * 映射到 ai-memory 仓库（github.com/leviseek/ai-memory）中 stable/、profiles/、policies/ 下的 YAML 文件。
 *
 * - minimal profiles（lite / economy / cheap）仅读取用户基础信息
 * - intermediate profiles（balanced / writing）额外读取工作流和设备信息
 * - specialist profiles（coding / research）根据项目类型加载特定配置
 * - max 加载全部可用文件
 */
export const profileMemoryMap: ProfileMemoryMap = {
  lite: ["stable/user.yaml"],
  economy: ["stable/user.yaml"],
  cheap: ["stable/user.yaml"],
  balanced: ["stable/user.yaml", "stable/workflows.yaml", "stable/devices.yaml"],
  coding: ["stable/user.yaml", "stable/workflows.yaml", "stable/devices.yaml", "profiles/coding.yaml"],
  research: ["stable/user.yaml", "profiles/research.yaml"],
  writing: ["stable/user.yaml", "stable/workflows.yaml"],
  max: [
    "stable/user.yaml",
    "stable/workflows.yaml",
    "stable/devices.yaml",
    "profiles/coding.yaml",
    "profiles/research.yaml",
    "profiles/infra.yaml",
    "policies/memory-policy.yaml",
  ],
};

const defaultMemoryFiles: readonly string[] = ["stable/user.yaml"];

/**
 * 获取指定 OpenCode profile 对应的 ai-memory 文件绝对路径列表。
 *
 * 会根据 {@link profileMemoryMap} 查找对应文件集，对每个文件执行路径拼接后检查本地是否存在。
 * 不存在的文件会被静默跳过，确保返回的路径都是可读取的。
 *
 * @param profile  - OpenCode profile 名称。
 *                   支持：lite、economy、cheap、balanced、coding、research、writing、max。
 *                   未匹配的 profile 名称会回退到仅包含 stable/user.yaml 的默认集。
 * @param aiMemoryBase - ai-memory 仓库在本地文件系统中的根目录绝对路径。
 *                       例如项目根目录为 `D:\ai-share` 时，此值通常为 `D:\ai-memory`。
 * @returns 本地实际存在的 ai-memory 文件绝对路径数组。当没有文件存在时返回空数组。
 */
export function getMemoryFilesForProfile(profile: string, aiMemoryBase: string): string[] {
  const relativeFiles: readonly string[] = profileMemoryMap[profile] ?? defaultMemoryFiles;
  return relativeFiles
    .map((file: string): string => resolve(aiMemoryBase, file))
    .filter((filePath: string): boolean => existsSync(filePath));
}

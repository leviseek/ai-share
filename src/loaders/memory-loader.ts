import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Profile 到 memory 文件相对路径列表的映射。
 * key 为 OpenCode profile 名称，value 为相对于项目根目录 memory/ 目录的文件路径数组。
 */
export type ProfileMemoryMap = Record<string, readonly string[]>;

/**
 * 各 OpenCode profile 对应的 memory 文件集（仅包含从 ai-memory 仓库迁移的文件）。
 *
 * 映射到项目根目录 memory/ 下 stable/、profiles/、policies/ 中的 YAML 文件。
 * user/、architecture/、stack/ 目录下的文件由 {@link buildInstructionsPaths} 硬编码，
 * 对所有 profile 统一加载，不受此映射影响。
 *
 * 策略说明：
 * - lite / economy / cheap（轻量级 profile）：仅读取用户基础身份信息（stable/user.yaml），
 *   适合快速往返和低成本场景，不加载额外工作流或设备信息。
 * - balanced（日常编码默认值）：加载工作流和设备偏好，为日常任务提供适中的上下文。
 * - writing（写作润色）：加载工作流偏好，适合文档和文章处理场景。
 * - coding（代码实施专精）：额外加载 coding profile 特定配置（profiles/coding.yaml），
 *   适合大量代码生成的场景。
 * - research（深度推理/研究）：加载 research profile 特定配置（profiles/research.yaml），
 *   但不加载 workflows 和 devices（研究场景不依赖日常工作流信息）。
 * - max（全力模式）：加载全部可用文件，包括 all stable、profiles 和 policies 配置，
 *   提供最完整的上下文。
 */
export const profileMemoryMap: ProfileMemoryMap = {
  lite: ["memory/stable/user.yaml"],
  economy: ["memory/stable/user.yaml"],
  cheap: ["memory/stable/user.yaml"],
  balanced: ["memory/stable/user.yaml", "memory/stable/workflows.yaml", "memory/stable/devices.yaml"],
  coding: [
    "memory/stable/user.yaml",
    "memory/stable/workflows.yaml",
    "memory/stable/devices.yaml",
    "memory/profiles/coding.yaml",
  ],
  research: ["memory/stable/user.yaml", "memory/profiles/research.yaml"],
  writing: ["memory/stable/user.yaml", "memory/stable/workflows.yaml"],
  max: [
    "memory/stable/user.yaml",
    "memory/stable/workflows.yaml",
    "memory/stable/devices.yaml",
    "memory/profiles/coding.yaml",
    "memory/profiles/research.yaml",
    "memory/profiles/infra.yaml",
    "memory/policies/memory-policy.yaml",
  ],
};

/**
 * 获取指定 OpenCode profile 对应的 memory 文件绝对路径列表。
 *
 * 会根据 {@link profileMemoryMap} 查找对应文件集，对每个文件拼接 projectRoot 后检查本地是否存在。
 * 不存在的文件会被静默跳过，确保返回的路径都是可读取的。
 *
 * @param profile  - OpenCode profile 名称。
 *                   支持：lite、economy、cheap、balanced、coding、research、writing、max。
 *                   未匹配的 profile 名称会回退到仅包含 memory/stable/user.yaml 的默认集。
 * @param projectRoot - 项目根目录绝对路径（如 `D:\ai-share`），memory/ 目录由其解析。
 * @returns 本地实际存在的 memory 文件绝对路径数组。当没有文件存在时返回空数组。
 */
export function getMemoryFilesForProfile(profile: string, projectRoot: string): string[] {
  const relativeFiles: readonly string[] = profileMemoryMap[profile] ?? ["memory/stable/user.yaml"];
  return relativeFiles
    .map((file: string): string => resolve(projectRoot, file))
    .filter((filePath: string): boolean => existsSync(filePath));
}

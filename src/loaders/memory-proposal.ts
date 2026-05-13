import { appendFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * A single memory proposal entry.
 * Represents one suggested addition to an ai-memory YAML file.
 */
export type ProposalEntry = {
  /** Target YAML file relative to ai-memory (e.g. "stable/user.yaml") */
  category: string;
  /** The exact YAML key path being modified (e.g. "coding_style.preferences.zod") */
  keyPath: string;
  /** YAML content to add, as a raw string */
  content: string;
  /** Why this memory matters */
  reason: string;
  /** Where this came from (e.g. "conversation about zod vs io-ts") */
  source: string;
};

/**
 * A complete memory proposal document.
 * Contains metadata about the session and an array of proposed entries.
 */
export type ProposalDocument = {
  metadata: {
    /** OpenCode session identifier */
    sessionId: string;
    /** ISO date string when the proposal was generated */
    date: string;
    /** One-line summary of what the conversation covered */
    summary: string;
  };
  /** Proposed memory entries */
  entries: ProposalEntry[];
};

/**
 * System instruction for AI to generate memory proposals at session end.
 * Injected into AI startup instructions so the model knows how to
 * propose structured memory entries after important conversations.
 *
 * Written in Chinese as required by the ai-memory workflow.
 */
export const MEMORY_PROPOSAL_INSTRUCTIONS: string = [
  "# 记忆提案系统",
  "",
  "你可以在有价值的对话结束时，提议将本次对话中获取的重要信息写入 ai-memory 仓库，以便未来会话中自动加载。",
  "",
  "## 什么情况下应该提议",
  "",
  "- 用户表达了新的编码偏好、工作流习惯或工具选择",
  "- 用户提到了多设备配置、路径约定或同步策略",
  "- 用户分享了项目架构决策、设计模式或技术选型",
  "- 对话中纠正了你的误解，或补充了你缺失的项目上下文",
  "- 用户明确了沟通风格、输出格式或协作方式的偏好",
  "",
  "## 提案条目字段",
  "",
  "每个提案条目使用 `ProposalEntry` 类型，包含以下字段：",
  "",
  "- **category**: 目标 YAML 文件路径（相对于 ai-memory 根目录），例如：",
  "  - `stable/user.yaml` — 用户画像、编码风格、偏好",
  "  - `stable/workflows.yaml` — 开发流程、验证习惯、调试策略",
  "  - `stable/devices.yaml` — 多设备配置、路径约定",
  "  - `profiles/coding.yaml` — 项目级编码规范",
  "  - `profiles/research.yaml` — 调研相关配置",
  "  - `policies/memory-policy.yaml` — 记忆管理策略",
  "- **keyPath**: 被修改的 YAML 键路径，例如 `coding_style.preferences.zod`",
  "- **content**: 建议写入的精确 YAML 内容，使用正确的 2 空格缩进",
  "- **reason**: 为什么这条信息值得持久化（对未来的价值）",
  "- **source**: 信息来源（对话主题、用户明确说明、观察推断等）",
  "",
  "## 提案展示格式",
  "",
  "使用 `formatProposal()` 生成 Markdown 预览，格式如下：",
  "",
  "```markdown",
  "## 🧠 记忆提案",
  "",
  "会话摘要：{summary}",
  "日期：{date}",
  "会话 ID：{sessionId}",
  "",
  "### 提案 1：{category} → {keyPath}",
  "**内容**：",
  "```yaml",
  "{content}",
  "```",
  "**理由**：{reason}",
  "**来源**：{source}",
  "",
  "- [ ] 确认写入  [ ] 拒绝",
  "```",
  "",
  "## 提案流程",
  "",
  "1. 在对话结束时，总结本次对话中值得记录的关键信息",
  "2. 识别用户的偏好、决策、模式和工作流习惯",
  "3. 用 `generateProposalTemplate(sessionId, summary)` 创建提案模板",
  "4. 为每条信息创建一个 `ProposalEntry`，填入 category、keyPath、content、reason、source",
  "5. 使用 `formatProposal()` 生成格式化的 Markdown 提案",
  "6. 将提案呈现给用户，包含每个条目的完整内容和操作选项",
  "7. **等待用户明确确认**后再执行写入",
  "8. 如果用户要求修改，更新对应条目后重新呈现",
  "9. 用户确认后，使用 `writeProposal(doc, aiMemoryBase)` 执行写入",
  "10. 写入前会自动创建备份，用户可随时回滚",
  "",
  "## 重要规则",
  "",
  "- 只提议你确认有价值且准确的信息",
  "- 不提议猜测性、临时性或明显会过时的信息",
  "- YAML 内容必须格式正确，使用 2 空格缩进",
  "- 每个条目只包含一个独立的信息点，便于选择性采纳",
  "- 用户可能只批准部分条目，尊重用户的选择",
  "- 如果用户修改了提案内容，使用修改后的版本写入",
  "- 字段 `keyPath` 使用点号分隔路径，如 `coding_style.principles`",
].join("\n");

/**
 * Creates a proposal document with the given session metadata and no entries.
 * Useful as a starting template for AI to fill in.
 *
 * @param sessionId - OpenCode session identifier.
 * @param summary   - One-line summary of what the conversation covered.
 * @returns A ProposalDocument with initialized metadata and empty entries array.
 */
export function generateProposalTemplate(sessionId: string, summary: string): ProposalDocument {
  return {
    metadata: {
      sessionId,
      date: new Date().toISOString().split("T")[0] ?? "",
      summary,
    },
    entries: [],
  };
}

/**
 * Formats a ProposalDocument into a readable Markdown string for user review.
 * Each entry is shown with its category, keyPath, YAML content, reason, and source.
 *
 * @param doc - The proposal document to format.
 * @returns A Markdown string ready for display.
 */
export function formatProposal(doc: ProposalDocument): string {
  const { metadata, entries } = doc;
  const lines: string[] = [
    "## 🧠 记忆提案",
    "",
    `会话摘要：${metadata.summary}`,
    `日期：${metadata.date}`,
    `会话 ID：${metadata.sessionId}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("*暂无提案条目*");
    lines.push("");
    return lines.join("\n");
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }

    lines.push(`### 提案 ${i + 1}：${entry.category} → ${entry.keyPath}`);
    lines.push("**内容**：");
    lines.push("```yaml");
    lines.push(entry.content);
    lines.push("```");
    lines.push(`**理由**：${entry.reason}`);
    lines.push(`**来源**：${entry.source}`);
    lines.push("");
    lines.push("- [ ] 确认写入  [ ] 拒绝");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Writes confirmed proposal entries to ai-memory YAML files.
 *
 * For each entry, appends the YAML content to the target file under
 * the ai-memory base directory. Creates a backup (.bak) of each
 * existing file before writing. Does NOT perform full YAML merge;
 * the user can reconcile conflicts later.
 *
 * @param doc          - The confirmed proposal document with entries to write.
 * @param aiMemoryBase - Absolute path to the ai-memory repository root.
 */
export function writeProposal(doc: ProposalDocument, aiMemoryBase: string): void {
  for (const entry of doc.entries) {
    const targetPath = resolve(aiMemoryBase, entry.category);
    const targetDir = dirname(targetPath);

    // Ensure target directory exists
    mkdirSync(targetDir, { recursive: true });

    // Create backup if file already exists
    if (existsSync(targetPath)) {
      const backupPath = `${targetPath}.bak`;
      copyFileSync(targetPath, backupPath);
    }

    // Append the YAML content with a separator if file already has content
    const separator = existsSync(targetPath) ? "\n" : "";
    appendFileSync(targetPath, `${separator}${entry.content}\n`);
  }
}

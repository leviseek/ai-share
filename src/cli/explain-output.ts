import { createColor, type ColorPalette } from "./color.ts";
import type { ExplainPlanEntry, ExplainReport } from "./explain-report.ts";
import type { PlanReason } from "./generation-plan.ts";

const REASON_TEXT: Readonly<Record<PlanReason, string>> = {
  "target-missing": "目标不存在，将创建",
  "content-current": "受管内容已是最新",
  "managed-content-drift": "受管内容发生漂移，将更新",
  "managed-mode-drift": "Unix launcher 执行权限发生漂移，将修复",
  "env-managed-block-drift": ".env managed block 发生漂移，将更新",
  "force-adoption": "--force 模拟接管未受管目标",
  "unowned-collision": "未受管目标阻止生成",
  "blocking-path-collision": "目标路径类型阻挡受管输出",
  "force-replace-blocking-path": "--force 模拟替换阻挡路径",
  "stale-managed-skill": "已不再声明的受管 skill，将删除",
  "unmanaged-skill-preserved": "用户 skill 不属于 ai-share，保留",
  "invalid-marker-preserved": "skill marker 无效，保留并提示风险",
};

export function renderExplainReport(report: ExplainReport, useColor: boolean): string {
  const palette = createColor(useColor);
  const lines = [palette.bold("ai:explain 可解释生成"), ""];

  lines.push(sectionTitle("1. 输入决策", palette));
  lines.push(
    `  Provider: ${palette.cyan(report.inputs.provider.id || "不可用")} ` +
      palette.gray(`source=${report.inputs.provider.source}`),
  );
  lines.push(`  Provider 配置: ${report.inputs.provider.config_source || "不可用"}`);
  lines.push(`  API Key 环境变量: ${report.inputs.provider.api_key_env || "不可用"}`);
  lines.push(
    `  Model: ${palette.cyan(report.inputs.model.id || "不可用")} ` +
      palette.gray(`upstream=${report.inputs.model.model_name || "不可用"} source=${report.inputs.model.source}`),
  );
  if (report.inputs.model.reasoning_effort) {
    lines.push(`  Reasoning effort: ${report.inputs.model.reasoning_effort}`);
  }
  lines.push(`  Model ID 来源: ${report.inputs.model.id_source || "不可用"}`);
  lines.push(`  Model 定义来源: ${report.inputs.model.definition_source || "不可用"}`);
  lines.push(`  Task: ${report.inputs.task.value ?? "none"} ${palette.gray(`source=${report.inputs.task.source}`)}`);
  lines.push(`  ${riskText(`force=${report.inputs.force}`, report.inputs.force, palette)}`);

  lines.push("", sectionTitle("2. 配置来源", palette));
  appendList(lines, "基础文件", report.config.base_files);
  appendList(lines, "生效 overlay", report.config.active_overlays);
  appendList(lines, "MCP server ID", report.config.mcp_server_ids);
  appendList(lines, "受管 env 名称", report.config.managed_env_names);
  appendList(lines, "Agent ID", report.config.agent_ids);
  appendList(lines, "Plugin ID", report.config.plugin_ids);

  lines.push("", sectionTitle("3. Memory 选择", palette));
  appendList(lines, "固定路径", report.memory.fixed_paths);
  if (report.memory.selected.length === 0) lines.push("  已选择: none");
  else {
    lines.push("  已选择:");
    for (const entry of report.memory.selected) {
      lines.push(`    - #${entry.rank} ${entry.path} score=${entry.total_score}`);
    }
  }
  if (report.memory.ranked_candidates.length === 0) lines.push("  排名候选: none");
  else {
    lines.push("  排名候选:");
    for (const entry of report.memory.ranked_candidates) {
      const score = entry.score_breakdown;
      const matched = [
        ...entry.matched_tokens.title.map((token) => `title:${token}`),
        ...entry.matched_tokens.path.map((token) => `path:${token}`),
        ...entry.matched_tokens.content.map((token) => `content:${token}`),
      ];
      lines.push(
        `    - #${entry.rank} ${entry.selected ? "selected" : "candidate"} ${entry.path} ` +
          `score=${entry.total_score} (${score.title}+${score.path}+${score.content}) ` +
          `matched=${matched.join(",") || "none"}`,
      );
    }
  }
  if (report.memory.policy_exclusions.length === 0) lines.push("  策略排除: none");
  else {
    lines.push("  策略排除:");
    for (const entry of report.memory.policy_exclusions) {
      lines.push(`    - ${entry.path} reason=${entry.reason}`);
    }
  }

  lines.push("", sectionTitle("4. 文件计划", palette));
  appendPlanEntries(lines, "Actions", report.plan.actions, palette);
  appendPlanEntries(lines, "Preserved", report.plan.preserved, palette);
  appendPlanEntries(lines, "Collisions", report.plan.collisions, palette);

  lines.push("", sectionTitle("5. 结果", palette));
  if (report.status === "ok") {
    lines.push(`  ${palette.green("✓ OK")}：计划有效；ai:explain 未写入任何文件。`);
  } else if (report.status === "collision") {
    lines.push(`  ${palette.red("✗ COLLISION")}：存在未受管冲突；ai:explain 未写入任何文件。`);
  } else {
    lines.push(`  ${palette.red("✗ ERROR")}：解释过程失败；ai:explain 未写入任何文件。`);
  }
  if (report.error) {
    lines.push(`  code=${report.error.code}`);
    for (const message of report.error.messages) lines.push(`  - ${message}`);
  }

  return lines.join("\n");
}

function sectionTitle(text: string, palette: ColorPalette): string {
  return palette.bold(palette.cyan(text));
}

function appendList(lines: string[], label: string, entries: readonly string[]): void {
  if (entries.length === 0) {
    lines.push(`  ${label}: none`);
    return;
  }
  lines.push(`  ${label}:`);
  for (const entry of entries) lines.push(`    - ${entry}`);
}

function appendPlanEntries(
  lines: string[],
  label: string,
  entries: readonly ExplainPlanEntry[],
  palette: ColorPalette,
): void {
  if (entries.length === 0) {
    lines.push(`  ${label}: none`);
    return;
  }
  lines.push(`  ${label}:`);
  for (const entry of entries) {
    const detail = `${entry.kind.toUpperCase()} ${entry.path} ownership=${entry.ownership} reason=${entry.reason}`;
    lines.push(`    - ${paintPlanEntry(entry, detail, palette)}`);
    lines.push(`      ${palette.gray(REASON_TEXT[entry.reason])}`);
  }
}

function paintPlanEntry(entry: ExplainPlanEntry, text: string, palette: ColorPalette): string {
  if (entry.kind === "collision") return palette.red(text);
  if (
    entry.reason === "force-adoption" ||
    entry.reason === "force-replace-blocking-path" ||
    entry.reason === "invalid-marker-preserved"
  ) {
    return palette.yellow(text);
  }
  if (entry.kind === "create" || entry.kind === "update") return palette.green(text);
  return text;
}

function riskText(text: string, risk: boolean, palette: ColorPalette): string {
  return risk ? palette.yellow(text) : text;
}

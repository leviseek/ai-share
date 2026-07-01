#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { color } from "./color.ts";
import { buildGeneratorPaths } from "./paths.ts";

type Step = {
  label: string;
  command: string;
  args: string[];
};

const paths = buildGeneratorPaths();
const bunCommand = process.execPath || "bun";
const skipInstall = Bun.argv.includes("--skip-install");

const steps: Step[] = [
  ...(skipInstall ? [] : [{ label: "安装 Bun 依赖", command: bunCommand, args: ["install"] }]),
  { label: "检查 ai-share 配置", command: bunCommand, args: ["run", "ai:check"] },
  { label: "生成并安装用户级 AI 运行时", command: bunCommand, args: ["run", "ai:gen", "--", "--force"] },
];

console.log(color.bold("ai-share bootstrap"));
console.log(`${color.cyan("项目目录")}：${paths.projectRoot}`);
console.log(`${color.cyan("Codex home")}：${paths.targetCodexConfigDir}`);
console.log("");

for (const step of steps) {
  runStep(step);
}

console.log("");
console.log(color.green("bootstrap 完成。现在可以在任意项目目录运行：codex"));

function runStep(step: Step): void {
  console.log(`${color.cyan("▶")} ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: paths.projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(`${color.yellow("失败")}：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${color.yellow("失败")}：${step.label}（exit ${result.status ?? "unknown"}）`);
    process.exit(result.status ?? 1);
  }
}

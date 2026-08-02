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
  ...(skipInstall ? [] : [{ label: "安装 Bun 依赖", command: bunCommand, args: ["install", "--frozen-lockfile"] }]),
  { label: "检查 ai-share 配置", command: bunCommand, args: ["run", "ai:check"] },
  { label: "生成并安装用户级 OpenCode 配置", command: bunCommand, args: ["run", "ai:gen"] },
];

console.log(color.bold("ai-share bootstrap"));
console.log(`${color.cyan("项目目录")}：${paths.projectRoot}`);
console.log(`${color.cyan("OpenCode config")}：${paths.targetOpenCodeConfigDir}`);
console.log("");

let exitCode = 0;
for (const step of steps) {
  exitCode = runStep(step);
  if (exitCode !== 0) break;
}

if (exitCode === 0) {
  console.log("");
  console.log(color.green("bootstrap 完成。现在可以在任意项目目录运行：aioc"));
}
process.exitCode = exitCode;

function runStep(step: Step): number {
  console.log(`${color.cyan("▶")} ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: paths.projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(`${color.yellow("失败")}：${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(`${color.yellow("失败")}：${step.label}（exit ${result.status ?? "unknown"}）`);
    return result.status ?? 1;
  }
  return 0;
}

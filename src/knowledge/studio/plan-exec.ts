import type { CodexDryRun } from "./data.ts";

export type PlanExecGitGuard = {
  beforeStatus: string;
  afterStatus: string;
  changedFiles: string[];
};

export type PlanExecGuardResult = {
  ok: boolean;
  mode: "readonly-plan";
  command: "codex exec";
  messages: string[];
  git: PlanExecGitGuard;
};

export type PlanExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
};

export type CodexPlanExec = {
  dryRun: CodexDryRun;
  guardResult: PlanExecGuardResult;
  execResult: PlanExecResult;
};

export type PlanExecRunner = (input: { prompt: string; timeoutMs: number }) => Promise<PlanExecResult>;

export type GitStatusReader = () => Promise<string>;

const READONLY_PLAN_PREFIX = [
  "你正在 Repository Intelligence Studio 的只读 Plan Exec 模式中运行。",
  "安全边界：只允许分析、解释、审查和制定计划。",
  "禁止编辑文件、写入文件、删除文件、运行破坏性命令、提交、推送或改写 Git 历史。",
  "如果任务需要修改仓库，请只输出可执行计划、风险、验证步骤，不要执行修改。",
  "回答必须说明你使用了哪些上下文，以及为什么当前方案合理。",
].join("\n");

const DEFAULT_TIMEOUT_MS = 120_000;

export function composeReadonlyPlanPrompt(dryRun: CodexDryRun): string {
  return [
    READONLY_PLAN_PREFIX,
    "",
    "## User Task",
    dryRun.prompt,
    "",
    "## Knowledge Engine Trace",
    dryRun.trace.map((step) => `- ${step.name}: ${JSON.stringify(step.output)}`).join("\n"),
    "",
    dryRun.promptBundle.markdown,
  ].join("\n");
}

export function buildPlanExecGuard(beforeStatus: string, afterStatus: string): PlanExecGuardResult {
  const changedFiles = diffStatusFiles(beforeStatus, afterStatus);
  const ok = changedFiles.length === 0;
  return {
    ok,
    mode: "readonly-plan",
    command: "codex exec",
    messages: [
      "固定使用 codex exec <readonly-prompt>。",
      "用户输入不会作为 CLI flag 传递。",
      "readonly prompt 禁止文件写入和 Git 修改。",
      ...(ok ? [] : ["Plan Exec produced workspace changes; review manually."]),
    ],
    git: { beforeStatus, afterStatus, changedFiles },
  };
}

export async function runCodexPlanExec(
  dryRun: CodexDryRun,
  runner: PlanExecRunner = runCodexExec,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  gitStatus: GitStatusReader = readGitStatus,
): Promise<CodexPlanExec> {
  const beforeStatus = await gitStatus();
  const prompt = composeReadonlyPlanPrompt(dryRun);
  const execResult = await runner({ prompt, timeoutMs });
  const afterStatus = await gitStatus();
  const guardResult = buildPlanExecGuard(beforeStatus, afterStatus);
  return { dryRun, guardResult, execResult };
}

export async function runCodexExec(input: { prompt: string; timeoutMs: number }): Promise<PlanExecResult> {
  const startedAt = Date.now();
  try {
    const process = Bun.spawn(["codex", "exec", input.prompt], {
      stdout: "pipe",
      stderr: "pipe",
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      process.kill();
    }, input.timeoutMs);
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]).finally(() => clearTimeout(timeout));
    return {
      stdout,
      stderr: timedOut ? `${stderr}\nPlan Exec timed out after ${input.timeoutMs}ms.` : stderr,
      exitCode,
      durationMs: Date.now() - startedAt,
      timedOut,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : "无法启动 codex exec。",
      exitCode: null,
      durationMs: Date.now() - startedAt,
      timedOut: false,
    };
  }
}

export async function readGitStatus(): Promise<string> {
  const process = Bun.spawn(["git", "status", "--short"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`git status --short 失败：${stderr}`);
  return stdout.trimEnd();
}

function diffStatusFiles(beforeStatus: string, afterStatus: string): string[] {
  const before = parseStatusFiles(beforeStatus);
  const after = parseStatusFiles(afterStatus);
  return [...new Set([...symmetricDifference(before, after)])].sort();
}

function parseStatusFiles(status: string): Set<string> {
  return new Set(
    status
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\S+\s+/, "")),
  );
}

function symmetricDifference(left: Set<string>, right: Set<string>): string[] {
  const values: string[] = [];
  for (const value of left) {
    if (!right.has(value)) values.push(value);
  }
  for (const value of right) {
    if (!left.has(value)) values.push(value);
  }
  return values;
}

import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize, resolve } from "node:path";
import { WEZTERM_CONFIG_MANAGED_HEADER } from "../config/builders/wezterm.ts";
import { StagedFileWriter } from "./fs.ts";

export type WezTermPlan =
  | {
      kind: "create" | "update";
      path: string;
      ownership: "missing" | "managed" | "unmanaged";
      reason: "target-missing" | "managed-content-drift" | "force-adoption";
      content: string;
    }
  | {
      kind: "preserve";
      path: string;
      ownership: "managed";
      reason: "content-current";
    }
  | {
      kind: "collision";
      path: string;
      ownership: "unmanaged";
      reason: "unowned-collision" | "blocking-path-collision";
    };

export async function buildWezTermPlan(input: { path: string; content: string; force: boolean }): Promise<WezTermPlan> {
  const path = assertWezTermTarget(input.path);
  const current = await lstatIfExists(path);
  if (!current) {
    return { kind: "create", path, ownership: "missing", reason: "target-missing", content: input.content };
  }
  if (!current.isFile() || current.isSymbolicLink()) {
    return { kind: "collision", path, ownership: "unmanaged", reason: "blocking-path-collision" };
  }

  const existing = await readFile(path, "utf8");
  if (existing === input.content) return { kind: "preserve", path, ownership: "managed", reason: "content-current" };
  if (existing.startsWith(WEZTERM_CONFIG_MANAGED_HEADER)) {
    return { kind: "update", path, ownership: "managed", reason: "managed-content-drift", content: input.content };
  }
  if (input.force)
    return { kind: "update", path, ownership: "unmanaged", reason: "force-adoption", content: input.content };
  return { kind: "collision", path, ownership: "unmanaged", reason: "unowned-collision" };
}

export async function executeWezTermPlan(plan: WezTermPlan, stagingRoot: string): Promise<void> {
  assertWezTermTarget(plan.path);
  if (plan.kind === "collision") throw new Error(`WezTerm 目标存在未受管冲突：${plan.path}`);
  if (plan.kind === "preserve") return;

  const writer = await StagedFileWriter.create(stagingRoot);
  try {
    await writer.writeText(plan.path, plan.content);
    await writer.promote();
  } catch (error) {
    await writer.cleanup();
    throw error;
  }
}

function assertWezTermTarget(path: string): string {
  const target = resolve(path);
  const configDir = dirname(target);
  const hiddenConfigDir = dirname(configDir);
  if (
    !isAbsolute(path) ||
    normalize(target) !== target ||
    basename(target) !== "wezterm.lua" ||
    basename(configDir) !== "wezterm" ||
    basename(hiddenConfigDir) !== ".config"
  ) {
    throw new Error("WezTerm 输出路径必须是用户目录下的 .config/wezterm/wezterm.lua");
  }
  return target;
}

async function lstatIfExists(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

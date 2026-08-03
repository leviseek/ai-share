import type { Stats } from "node:fs";
import { lstat, readFile, rename } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { WEZTERM_CONFIG_MANAGED_HEADER } from "../config/builders/wezterm.ts";
import { StagedFileWriter, type StagedFileWriterOptions } from "./fs.ts";
import type { WezTermPaths } from "./paths.ts";

type WezTermFilePrecondition = {
  kind: "missing" | "file";
  content?: string;
  stat?: FileStat;
};

type WezTermAncestorPrecondition = {
  path: string;
  kind: "missing" | "directory" | "blocking";
  stat?: FileStat;
};

type WezTermPrecondition = {
  target: WezTermFilePrecondition;
  ancestors: WezTermAncestorPrecondition[];
};

type FileStat = {
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
};

export type WezTermPlan =
  | {
      kind: "create" | "update";
      path: string;
      ownership: "missing" | "managed" | "unmanaged";
      reason: "target-missing" | "managed-content-drift" | "force-adoption";
      content: string;
      precondition: WezTermPrecondition;
    }
  | {
      kind: "preserve";
      path: string;
      ownership: "managed";
      reason: "content-current";
      precondition: WezTermPrecondition;
    }
  | {
      kind: "collision";
      path: string;
      ownership: "unmanaged";
      reason: "unowned-collision" | "blocking-path-collision";
    };

export async function buildWezTermPlan(input: {
  paths: WezTermPaths;
  content: string;
  force: boolean;
}): Promise<WezTermPlan> {
  const target = assertTrustedWezTermPaths(input.paths);
  const ancestors = await inspectAncestors(input.paths);
  if (ancestors.some(({ kind }) => kind === "blocking")) {
    return { kind: "collision", path: target, ownership: "unmanaged", reason: "blocking-path-collision" };
  }

  const targetState = await inspectTarget(target);
  if (targetState.kind === "missing") {
    return {
      kind: "create",
      path: target,
      ownership: "missing",
      reason: "target-missing",
      content: input.content,
      precondition: precondition(targetState, ancestors),
    };
  }
  if (targetState.kind !== "file") {
    return { kind: "collision", path: target, ownership: "unmanaged", reason: "blocking-path-collision" };
  }

  const targetPrecondition = precondition(targetState, ancestors);
  if (targetState.content === input.content) {
    return {
      kind: "preserve",
      path: target,
      ownership: "managed",
      reason: "content-current",
      precondition: targetPrecondition,
    };
  }
  if (targetState.content.startsWith(WEZTERM_CONFIG_MANAGED_HEADER)) {
    return {
      kind: "update",
      path: target,
      ownership: "managed",
      reason: "managed-content-drift",
      content: input.content,
      precondition: targetPrecondition,
    };
  }
  if (input.force) {
    return {
      kind: "update",
      path: target,
      ownership: "unmanaged",
      reason: "force-adoption",
      content: input.content,
      precondition: targetPrecondition,
    };
  }
  return { kind: "collision", path: target, ownership: "unmanaged", reason: "unowned-collision" };
}

export async function executeWezTermPlan(
  plan: WezTermPlan,
  paths: WezTermPaths,
  stagingRoot: string,
  options: StagedFileWriterOptions = {},
): Promise<void> {
  const target = assertTrustedWezTermPaths(paths);
  if (plan.path !== target) throw new Error("WezTerm 计划路径与当前用户目标不匹配。");
  if (plan.kind === "collision") throw new Error(`WezTerm 目标存在未受管冲突：${plan.path}`);

  await assertPrecondition(plan, paths);
  if (plan.kind === "preserve") return;

  let promotionRenames = 0;
  const writerOptions = {
    ...options,
    rename: async (source: string, destination: string): Promise<void> => {
      const currentAncestors = await inspectAncestors(paths);
      if (currentAncestors.some(({ kind }) => kind === "blocking")) {
        throw new Error(`WezTerm 目标在计划后发生变化：${paths.targetWezTermConfig}`);
      }
      if (promotionRenames === 0) {
        const currentTarget = await inspectTarget(paths.targetWezTermConfig);
        if (!matchesPrecondition(plan.precondition, currentTarget, currentAncestors, true)) {
          throw new Error(`WezTerm 目标在计划后发生变化：${paths.targetWezTermConfig}`);
        }
      } else if ((await inspectTarget(paths.targetWezTermConfig)).kind !== "missing") {
        throw new Error(`WezTerm 目标在计划后发生变化：${paths.targetWezTermConfig}`);
      }
      await (options.rename ?? rename)(source, destination);
      promotionRenames += 1;
    },
  } satisfies StagedFileWriterOptions;
  const writer = await StagedFileWriter.create(stagingRoot, writerOptions);
  try {
    await writer.writeText(plan.path, plan.content);
    await writer.promote();
  } catch (error) {
    await writer.cleanup();
    throw error;
  }
}

function assertTrustedWezTermPaths(paths: WezTermPaths): string {
  if (!isAbsolute(paths.homeDir)) throw new Error("WezTerm 用户目录必须是绝对路径。");
  const expectedConfigDir = resolve(paths.homeDir, ".config", "wezterm");
  const expectedTarget = resolve(expectedConfigDir, "wezterm.lua");
  if (paths.targetWezTermConfigDir !== expectedConfigDir || paths.targetWezTermConfig !== expectedTarget) {
    throw new Error("WezTerm 输出路径必须精确匹配当前用户目录下的 .config/wezterm/wezterm.lua。");
  }
  return expectedTarget;
}

async function assertPrecondition(
  plan: Exclude<WezTermPlan, { kind: "collision" }>,
  paths: WezTermPaths,
  allowCreatedAncestors = false,
): Promise<void> {
  const currentAncestors = await inspectAncestors(paths);
  if (currentAncestors.some(({ kind }) => kind === "blocking")) {
    throw new Error(`WezTerm 目标在计划后发生变化：${paths.targetWezTermConfig}`);
  }
  const currentTarget = await inspectTarget(paths.targetWezTermConfig);
  if (!matchesPrecondition(plan.precondition, currentTarget, currentAncestors, allowCreatedAncestors)) {
    throw new Error(`WezTerm 目标在计划后发生变化：${paths.targetWezTermConfig}`);
  }
}

function matchesPrecondition(
  expected: WezTermPrecondition,
  currentTarget: Awaited<ReturnType<typeof inspectTarget>>,
  currentAncestors: Awaited<ReturnType<typeof inspectAncestors>>,
  allowCreatedAncestors = false,
): boolean {
  if (expected.target.kind !== currentTarget.kind) return false;
  if (expected.target.kind === "file" && currentTarget.kind === "file") {
    if (expected.target.content !== currentTarget.content) return false;
    if (!expected.target.stat || !sameStat(expected.target.stat, currentTarget.stat)) return false;
  }
  return expected.ancestors.every((ancestor, index) => {
    const current = currentAncestors[index];
    if (current?.path !== ancestor.path) return false;
    if (ancestor.kind === "missing" && allowCreatedAncestors && current.kind === "directory") return true;
    if (current.kind !== ancestor.kind) return false;
    if (ancestor.kind === "directory" && current.kind === "directory") {
      return (
        ancestor.stat !== undefined && current.stat !== undefined && sameDirectoryStat(ancestor.stat, current.stat)
      );
    }
    return true;
  });
}

async function inspectAncestors(
  paths: WezTermPaths,
): Promise<(WezTermAncestorPrecondition & { kind: "missing" | "directory" | "blocking" })[]> {
  const ancestorPaths = [dirname(paths.targetWezTermConfigDir), paths.targetWezTermConfigDir];
  const ancestors: (WezTermAncestorPrecondition & { kind: "missing" | "directory" | "blocking" })[] = [];
  for (const path of ancestorPaths) {
    const stat = await lstatIfExists(path);
    if (!stat) {
      ancestors.push({ path, kind: "missing" });
    } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
      ancestors.push({ path, kind: "directory", stat: fileStat(stat) });
    } else {
      ancestors.push({ path, kind: "blocking" });
    }
  }
  return ancestors;
}

async function inspectTarget(
  path: string,
): Promise<{ kind: "missing" } | { kind: "file"; content: string; stat: FileStat } | { kind: "blocking" }> {
  const stat = await lstatIfExists(path);
  if (!stat) return { kind: "missing" };
  if (!stat.isFile() || stat.isSymbolicLink()) return { kind: "blocking" };
  return { kind: "file", content: await readFile(path, "utf8"), stat: fileStat(stat) };
}

function precondition(
  target: Exclude<Awaited<ReturnType<typeof inspectTarget>>, { kind: "blocking" }>,
  ancestors: (WezTermAncestorPrecondition & { kind: "missing" | "directory" | "blocking" })[],
): WezTermPrecondition {
  return {
    target: target.kind === "file" ? { kind: "file", content: target.content, stat: target.stat } : { kind: "missing" },
    ancestors: ancestors.map(({ path, kind, stat }) => ({
      path,
      kind,
      ...(stat ? { stat } : {}),
    })),
  };
}

function fileStat(stat: Stats): FileStat {
  return { dev: stat.dev, ino: stat.ino, mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs };
}

function sameStat(left: FileStat, right: FileStat): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

function sameDirectoryStat(left: FileStat, right: FileStat): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

async function lstatIfExists(path: string): Promise<Stats | undefined> {
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

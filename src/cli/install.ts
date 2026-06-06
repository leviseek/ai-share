import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { pathExists } from "./fs.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";

export async function installLaunchers(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const launcherFiles = process.platform === "win32" ? ["aiomx.cmd", "aiomx.ps1", "aiomx.ts"] : ["aiomx", "aiomx.ts"];

  if (dryRun) {
    for (const fileName of launcherFiles) {
      console.log(`将安装启动命令：${resolve(paths.targetBinDir, fileName)}`);
    }
    if (process.platform === "win32") {
      console.log(`将确保用户 PATH 包含：${paths.targetBinDir}`);
    } else {
      console.log(`请确保 shell PATH 包含：${paths.targetBinDir}`);
    }
    return;
  }

  await mkdir(paths.targetBinDir, { recursive: true });
  for (const fileName of launcherFiles) {
    const sourcePath = resolve(paths.binDir, fileName);
    const targetPath = resolve(paths.targetBinDir, fileName);
    if (process.platform === "win32" && fileName.endsWith(".ps1")) {
      await writeFile(targetPath, withUtf8Bom(await readFile(sourcePath, "utf8")));
      continue;
    }
    await copyFile(sourcePath, targetPath);
    if (process.platform !== "win32" && !fileName.endsWith(".ts")) {
      await chmod(targetPath, 0o755);
    }
  }

  if (process.platform === "win32") {
    ensureWindowsUserPath(paths.targetBinDir);
  } else {
    console.log(`请确保 shell PATH 包含：${paths.targetBinDir}`);
  }
}

export async function installNativeSkills(paths: GeneratorPaths, dryRun: boolean, force: boolean): Promise<void> {
  if (dryRun) {
    for (const nativeSkill of NATIVE_SKILLS) {
      const skillPath = nativeSkillPath(paths, nativeSkill.name);
      console.log(`\n--- ${skillPath} ---\n${nativeSkill.content}`);
    }
    return;
  }

  for (const nativeSkill of NATIVE_SKILLS) {
    const skillPath = nativeSkillPath(paths, nativeSkill.name);
    if (!force && (await pathExists(skillPath))) {
      throw new Error(`目标已存在：${skillPath}\n如需覆盖，请运行：bun run ai:gen -- --force`);
    }
  }

  for (const nativeSkill of NATIVE_SKILLS) {
    const targetDir = resolve(paths.targetCodexSkillsDir, nativeSkill.name);
    await mkdir(targetDir, { recursive: true });
    await writeFile(resolve(targetDir, "SKILL.md"), nativeSkill.content);
  }
}

function nativeSkillPath(paths: GeneratorPaths, skillName: string): string {
  return resolve(paths.targetCodexSkillsDir, skillName, "SKILL.md");
}

function withUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content : `\uFEFF${content}`;
}

function ensureWindowsUserPath(path: string): void {
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  if (pathListIncludes(currentPath, path)) return;

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$pathToAdd = $env:AI_SHARE_BIN_DIR; " +
        "$current = [Environment]::GetEnvironmentVariable('Path', 'User'); " +
        "if (-not $current) { $current = '' }; " +
        "$parts = $current -split ';' | Where-Object { $_ }; " +
        "if ($parts -notcontains $pathToAdd) { " +
        "  $newPath = (@($parts) + $pathToAdd) -join ';'; " +
        "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User') " +
        "}",
    ],
    { env: { ...process.env, AI_SHARE_BIN_DIR: path }, stdio: "pipe", encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "更新 Windows 用户 PATH 失败。");
  }
}

function pathListIncludes(pathList: string, expectedPath: string): boolean {
  return pathList
    .split(process.platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .some((entry) => resolve(entry).toLowerCase() === resolve(expectedPath).toLowerCase());
}

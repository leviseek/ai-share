import { spawnSync } from "node:child_process";
import { cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { pathExists } from "./fs.ts";
import { gitMasterSkillContent } from "./native-skills.ts";

export async function installLaunchers(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const launcherFiles =
    process.platform === "win32"
      ? [
          "aiomo.cmd",
          "aiomo.ps1",
          "aioc.cmd",
          "aioc.ps1",
          "opencode-launcher-common.ps1",
          "opencode-context-guard.mjs",
          "aiomo-monitor.cmd",
          "aiomo-monitor.ps1",
        ]
      : ["aiomo", "aioc", "opencode-launcher-common.sh", "opencode-context-guard.mjs", "aiomo-monitor"];
  if (dryRun) {
    for (const fileName of launcherFiles) {
      console.log(`将安装启动命令：${resolve(paths.targetBinDir, fileName)}`);
    }
    console.log(`将安装上下文守卫模块：${resolve(paths.targetBinDir, "context-guard")}`);
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
  }
  await cp(resolve(paths.binDir, "context-guard"), resolve(paths.targetBinDir, "context-guard"), {
    recursive: true,
    force: true,
  });

  if (process.platform === "win32") {
    ensureWindowsUserPath(paths.targetBinDir);
  } else {
    console.log(`请确保 shell PATH 包含：${paths.targetBinDir}`);
  }
}

export async function installPlugins(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const pluginDirectories = ["omo-agent-monitor"];
  if (dryRun) {
    for (const directoryName of pluginDirectories) {
      console.log(`将安装 OpenCode 本地插件：${resolve(paths.targetPluginDir, directoryName)}`);
    }
    return;
  }

  await mkdir(paths.targetPluginDir, { recursive: true });
  for (const directoryName of pluginDirectories) {
    const builtPluginDir = await buildPlugin(paths, directoryName);
    await cp(builtPluginDir, resolve(paths.targetPluginDir, directoryName), {
      recursive: true,
      force: true,
    });
  }
}

export async function installNativeSkills(paths: GeneratorPaths, dryRun: boolean, force: boolean): Promise<void> {
  const gitMasterSkillPath = resolve(paths.targetSkillsDir, "git-master", "SKILL.md");
  const content = gitMasterSkillContent();
  if (dryRun) {
    console.log(`\n--- ${gitMasterSkillPath} ---\n${content}`);
    return;
  }

  if (!force && (await pathExists(gitMasterSkillPath))) {
    throw new Error(`目标已存在：${gitMasterSkillPath}\n如需覆盖，请运行：bun run ai:gen -- --force`);
  }

  await mkdir(resolve(paths.targetSkillsDir, "git-master"), { recursive: true });
  await writeFile(gitMasterSkillPath, content);
}

function withUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content : `\uFEFF${content}`;
}

async function buildPlugin(paths: GeneratorPaths, directoryName: string): Promise<string> {
  const sourceDir = resolve(paths.pluginDir, directoryName);
  const outputDir = resolve(paths.distPluginDir, directoryName);
  const result = spawnSync(
    "bun",
    [
      "build",
      resolve(sourceDir, "server.ts"),
      resolve(sourceDir, "tui.ts"),
      "--target=bun",
      "--outdir",
      outputDir,
      "--external",
      "bun:sqlite",
    ],
    { cwd: paths.projectRoot, stdio: "pipe", encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `构建插件失败：${directoryName}`);
  }
  await copyFile(resolve(sourceDir, "package.json"), resolve(outputDir, "package.json"));
  await copyFile(resolve(sourceDir, "agents-registry.json"), resolve(outputDir, "agents-registry.json"));
  return outputDir;
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

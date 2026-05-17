import { spawnSync } from "node:child_process";
import { chmod, cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { GeneratorPaths } from "./paths.ts";
import { pathExists } from "./fs.ts";
import { scanPlugins } from "./plugin-scanner.ts";
import { NATIVE_SKILLS } from "./native-skills.ts";

export async function installLaunchers(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const launcherFiles =
    process.platform === "win32"
      ? [
          "aiomo.cmd",
          "aiomo.ps1",
          "aioc.cmd",
          "aioc.ps1",
          "opencode-launcher-common.ps1",
          "opencode-install-doctor.ts",
          "aiomo-monitor.cmd",
          "aiomo-monitor.ps1",
          "live2d-pet.cmd",
          "live2d-pet.ps1",
        ]
      : ["aiomo", "aioc", "opencode-launcher-common.sh", "opencode-install-doctor.ts", "aiomo-monitor", "live2d-pet"];
  if (dryRun) {
    for (const fileName of launcherFiles) {
      console.log(`将安装启动命令：${resolve(paths.targetBinDir, fileName)}`);
    }
    console.log(`将安装上下文守卫入口：${resolve(paths.targetBinDir, "opencode-context-guard.ts")}`);
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
    if (process.platform !== "win32" && isPosixLauncher(fileName)) {
      await chmod(targetPath, 0o755);
    }
  }
  await writeFile(
    resolve(paths.targetBinDir, "opencode-context-guard.ts"),
    installedContextGuardCli(await readFile(resolve(paths.contextGuardSourceDir, "cli.ts"), "utf8")),
  );
  await cp(paths.contextGuardSourceDir, resolve(paths.targetBinDir, "context-guard"), {
    recursive: true,
    force: true,
  });
  await Bun.file(resolve(paths.targetBinDir, "context-guard", "cli.ts")).delete();

  if (process.platform === "win32") {
    ensureWindowsUserPath(paths.targetBinDir);
  } else {
    console.log(`请确保 shell PATH 包含：${paths.targetBinDir}`);
  }
}

export async function installPlugins(paths: GeneratorPaths, dryRun: boolean): Promise<void> {
  const scanResults = scanPlugins(paths.pluginDir);
  const validPluginDirs = scanResults.filter((r) => r.manifest !== null).map((r) => r.dirName);

  if (dryRun) {
    for (const dirName of validPluginDirs) {
      console.log(`将安装 OpenCode 本地插件：${resolve(paths.targetPluginDir, dirName)}`);
      if (dirName === "live2d-pet") {
        console.log(`将安装 Live2D pet 桌面壳源码：${resolve(paths.targetPluginDir, dirName, "src-tauri")}`);
        console.log(`如已构建，将安装 Live2D pet 桌面壳二进制：${live2dPetInstalledBinary(paths)}`);
      }
    }
    return;
  }

  await mkdir(paths.targetPluginDir, { recursive: true });
  for (const dirName of validPluginDirs) {
    const builtPluginDir = await buildPlugin(paths, dirName);
    await cp(builtPluginDir, resolve(paths.targetPluginDir, dirName), {
      recursive: true,
      force: true,
    });
  }
}

export async function installNativeSkills(paths: GeneratorPaths, dryRun: boolean, force: boolean): Promise<void> {
  if (dryRun) {
    for (const nativeSkill of NATIVE_SKILLS) {
      console.log(`\n--- ${nativeSkillPath(paths, nativeSkill.name)} ---\n${nativeSkill.content}`);
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
    await mkdir(resolve(paths.targetSkillsDir, nativeSkill.name), { recursive: true });
    await writeFile(nativeSkillPath(paths, nativeSkill.name), nativeSkill.content);
  }
}

function nativeSkillPath(paths: GeneratorPaths, skillName: string): string {
  return resolve(paths.targetSkillsDir, skillName, "SKILL.md");
}

function withUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content : `\uFEFF${content}`;
}

function isPosixLauncher(fileName: string): boolean {
  return !fileName.endsWith(".ts");
}

function installedContextGuardCli(content: string): string {
  return content.replaceAll('from "./', 'from "./context-guard/');
}

async function buildPlugin(paths: GeneratorPaths, directoryName: string): Promise<string> {
  const sourceDir = resolve(paths.pluginDir, directoryName);
  const outputDir = resolve(paths.distPluginDir, directoryName);
  const entrypoints = [resolve(sourceDir, "server.ts"), resolve(sourceDir, "tui.ts")];
  const standaloneEntrypoint = resolve(sourceDir, "standalone.ts");
  if (await pathExists(standaloneEntrypoint)) {
    entrypoints.push(standaloneEntrypoint);
  }
  const result = spawnSync(
    "bun",
    ["build", ...entrypoints, "--target=bun", "--outdir", outputDir, "--external", "bun:sqlite"],
    { cwd: paths.projectRoot, stdio: "pipe", encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `构建插件失败：${directoryName}`);
  }
  await copyFile(resolve(sourceDir, "package.json"), resolve(outputDir, "package.json"));
  if (directoryName === "live2d-pet") {
    await cp(resolve(sourceDir, "src-tauri"), resolve(outputDir, "src-tauri"), {
      recursive: true,
      force: true,
      filter: (sourcePath) => !sourcePath.includes(`${sep}target${sep}`) && !sourcePath.endsWith(`${sep}target`),
    });
    await cp(resolve(sourceDir, "tauri-client"), resolve(outputDir, "tauri-client"), { recursive: true, force: true });
    await copyLive2dPetDesktopBinary(sourceDir, outputDir);
  }
  if (await pathExists(resolve(sourceDir, "agents-registry.json"))) {
    await copyFile(resolve(sourceDir, "agents-registry.json"), resolve(outputDir, "agents-registry.json"));
  }
  return outputDir;
}

async function copyLive2dPetDesktopBinary(sourceDir: string, outputDir: string): Promise<void> {
  const binaryName = process.platform === "win32" ? "live2d-pet.exe" : "live2d-pet";
  const sourceBinary = resolve(sourceDir, "src-tauri", "target", "release", binaryName);
  if (!(await pathExists(sourceBinary))) return;

  const targetDir = resolve(outputDir, "src-tauri", "target", "release");
  await mkdir(targetDir, { recursive: true });
  await copyFile(sourceBinary, resolve(targetDir, binaryName));
}

function live2dPetInstalledBinary(paths: GeneratorPaths): string {
  const binaryName = process.platform === "win32" ? "live2d-pet.exe" : "live2d-pet";
  return resolve(paths.targetPluginDir, "live2d-pet", "src-tauri", "target", "release", binaryName);
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

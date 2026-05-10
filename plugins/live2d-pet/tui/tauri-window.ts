import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { floatBrowserWindow } from "./windows-window.ts";

declare const Bun: {
  file(path: string): { size?: number };
  spawn(
    command: string[],
    options: {
      cwd?: string;
      env?: Record<string, string | undefined>;
      stdout?: "ignore" | "inherit";
      stderr?: "ignore" | "inherit";
    },
  ): BrowserSubprocess;
  which(command: string): string | null;
};

type BrowserSubprocess = {
  pid: number;
  kill(exitCode?: number | NodeJS.Signals): void;
  exited: Promise<number>;
  unref?: () => void;
};

declare const process: { env: NodeJS.ProcessEnv; platform: "win32" | "darwin" | string };

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = existsSync(resolve(MODULE_DIR, "src-tauri")) ? MODULE_DIR : resolve(MODULE_DIR, "..");
const TAURI_SOURCE_DIR = resolve(PLUGIN_ROOT, "src-tauri");
const WINDOWS_EXE = resolve(TAURI_SOURCE_DIR, "target", "release", "live2d-pet.exe");
const UNIX_BIN = resolve(TAURI_SOURCE_DIR, "target", "release", "live2d-pet");
const WINDOW_WIDTH = 180;
const WINDOW_HEIGHT = 320;

export function openTauriWindow(url: string): BrowserSubprocess | undefined {
  const command = tauriCommand();
  if (!command) return undefined;

  const child = Bun.spawn(command, {
    cwd: TAURI_SOURCE_DIR,
    env: { ...process.env, LIVE2D_PET_URL: url },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (process.platform === "win32") {
    floatBrowserWindow(child.pid, {
      left: 80,
      top: 80,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    });
  }
  return child;
}

function tauriCommand(): string[] | undefined {
  const binary = process.platform === "win32" ? WINDOWS_EXE : UNIX_BIN;
  if (existsSync(binary)) return [binary];

  const cargo = Bun.which("cargo");
  if (!cargo || !existsSync(resolve(TAURI_SOURCE_DIR, "Cargo.toml"))) return undefined;
  console.warn("未找到已构建的 Tauri 可执行文件，回退到 cargo tauri dev。\n");
  return [cargo, "--manifest-path", resolve(TAURI_SOURCE_DIR, "Cargo.toml"), "tauri", "dev", "--no-watch"];
}

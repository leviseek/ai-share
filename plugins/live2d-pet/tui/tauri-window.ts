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
const WINDOW_WIDTH = 165;
const WINDOW_HEIGHT = 235;

export function openTauriWindow(): BrowserSubprocess | undefined {
  const command = tauriCommand();
  if (!command) return undefined;

  const child = Bun.spawn(command, {
    cwd: TAURI_SOURCE_DIR,
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

  return undefined;
}

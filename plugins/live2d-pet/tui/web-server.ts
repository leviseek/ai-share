import { existsSync } from "node:fs";
import { readLive2dPetState } from "./state.ts";
import { renderHtml } from "./renderer.ts";
import { floatBrowserWindow } from "./windows-window.ts";

declare const Bun: {
  serve(options: { hostname: string; port: number; fetch(request: Request): Response | Promise<Response> }): {
    port: number;
    stop(closeConnections?: boolean): void;
  };
  spawn(command: string[], options: { stdout: "ignore"; stderr: "ignore" }): BrowserSubprocess;
  file(path: string): { size?: number };
  which(command: string): string | null;
};

type BrowserSubprocess = {
  pid: number;
  kill(exitCode?: number | NodeJS.Signals): void;
  exited: Promise<number>;
  unref?: () => void;
};

declare const process: { platform: "win32" | "darwin" | string };

let webServer: ReturnType<typeof Bun.serve> | undefined;
let lastRequestAt = 0;
let idleTimer: ReturnType<typeof setInterval> | undefined;
const WEB_UI_PORT = 18080;
const WINDOW_LEFT = 80;
const WINDOW_TOP = 80;
const WINDOW_WIDTH = 320;
const WINDOW_HEIGHT = 420;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 60_000;

function startIdleTimer(): void {
  if (idleTimer) return;
  lastRequestAt = Date.now();
  idleTimer = setInterval(() => {
    if (webServer && Date.now() - lastRequestAt > IDLE_TIMEOUT_MS) closeWebUi();
  }, IDLE_CHECK_INTERVAL_MS);
}

export function closeWebUi(): void {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = undefined;
  }
  if (webServer) {
    webServer.stop(true);
    webServer = undefined;
  }
}

export async function ensureWebUi(): Promise<string> {
  const url = `http://127.0.0.1:${WEB_UI_PORT}`;
  if (webServer) return url;

  try {
    webServer = Bun.serve({
      hostname: "127.0.0.1",
      port: WEB_UI_PORT,
      fetch: async (request) => {
        lastRequestAt = Date.now();
        const url = new URL(request.url);
        if (url.pathname === "/state") {
          const state = await readLive2dPetState();
          return Response.json(state, {
            headers: { "Cache-Control": "no-store" },
          });
        }
        return new Response(renderHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      },
    });
    startIdleTimer();
    return url;
  } catch (error) {
    if (!isAddressInUseError(error)) {
      throw error;
    }
    if (await isExistingLive2dPetServer(url)) {
      return url;
    }
    throw error;
  }
}

export function openStandaloneWindow(url: string): BrowserSubprocess {
  const command = browserAppCommand(url);
  if (!command) {
    throw new Error("缺少可用的 Chromium/Edge 独立窗口程序");
  }
  const child = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  if (process.platform === "win32") {
    floatBrowserWindow(child.pid, {
      left: WINDOW_LEFT,
      top: WINDOW_TOP,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    });
  }
  return child;
}

function browserAppCommand(url: string): string[] | undefined {
  const appFlags = [
    "--app=" + url,
    `--window-size=${WINDOW_WIDTH},${WINDOW_HEIGHT}`,
    `--window-position=${WINDOW_LEFT},${WINDOW_TOP}`,
  ];
  if (process.platform === "win32") {
    const executable = browserExecutable(["msedge", "microsoft-edge", "chrome", "chromium", "brave"]);
    return executable ? [executable, ...appFlags] : undefined;
  }
  const executable = browserExecutable([
    "google-chrome-stable",
    "google-chrome",
    "chromium-browser",
    "chromium",
    "brave-browser",
    "microsoft-edge",
    "msedge",
    "chrome",
  ]);
  return executable ? [executable, ...appFlags] : undefined;
}

function browserExecutable(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const resolved = Bun.which(candidate);
    if (resolved) return resolved;
  }
  for (const candidate of windowsBrowserCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function isAddressInUseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = Reflect.get(error, "code");
  return code === "EADDRINUSE" || error.message.includes("Failed to start server. Is port 18080 in use?");
}

async function isExistingLive2dPetServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("Live2D Pet") && html.includes("live2d-canvas") && html.includes("house-scene");
  } catch {
    return false;
  }
}

function windowsBrowserCandidates(): string[] {
  return [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
}

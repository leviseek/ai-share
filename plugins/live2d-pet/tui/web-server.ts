import { renderHtml } from "./renderer.ts";

declare const Bun: {
  serve(options: { hostname: string; port: number; fetch(request: Request): Response | Promise<Response> }): {
    port: number;
    stop(closeConnections?: boolean): void;
  };
  spawn(command: string[], options: { stdout: "ignore"; stderr: "ignore" }): { unref(): void };
  which(command: string): string | null;
};

declare const process: { platform: "win32" | "darwin" | string };

let webServer: ReturnType<typeof Bun.serve> | undefined;
let lastRequestAt = 0;
let idleTimer: ReturnType<typeof setInterval> | undefined;
const WEB_UI_PORT = 18080;

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

  webServer = Bun.serve({
    hostname: "127.0.0.1",
    port: WEB_UI_PORT,
    fetch: () => {
      lastRequestAt = Date.now();
      return new Response(renderHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    },
  });
  startIdleTimer();
  return url;
}

export function openBrowser(url: string): void {
  const command = browserOpenCommand(url);
  if (!command) return;
  const child = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  child.unref();
}

function browserOpenCommand(url: string): string[] | undefined {
  if (process.platform === "win32") return ["cmd.exe", "/c", "start", "", url];
  if (process.platform === "darwin") return ["open", url];
  if (Bun.which("xdg-open")) return ["xdg-open", url];
  if (Bun.which("gio")) return ["gio", "open", url];
  if (Bun.which("wslview")) return ["wslview", url];
  if (Bun.which("powershell.exe")) return ["powershell.exe", "-NoProfile", "-Command", "Start-Process", url];
  if (Bun.which("cmd.exe")) return ["cmd.exe", "/c", "start", "", url];
  return undefined;
}

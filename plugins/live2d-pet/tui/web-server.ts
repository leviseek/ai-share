import { renderHtml } from "./renderer.ts";

declare const Bun: {
  serve(options: { hostname: string; port: number; fetch(request: Request): Response | Promise<Response> }): {
    port: number;
    stop(closeConnections?: boolean): void;
  };
  spawn(command: string[], options: { stdout: "ignore"; stderr: "ignore" }): { unref(): void };
};

declare const process: { platform: "win32" | "darwin" | string };

let webServer: ReturnType<typeof Bun.serve> | undefined;
let lastRequestAt = 0;
let idleTimer: ReturnType<typeof setInterval> | undefined;

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
  if (webServer) return `http://127.0.0.1:${webServer.port}`;

  webServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      lastRequestAt = Date.now();
      return new Response(renderHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    },
  });
  startIdleTimer();
  return `http://127.0.0.1:${webServer.port}`;
}

export function openBrowser(url: string): void {
  const command = browserOpenCommand(url);
  const child = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  child.unref();
}

function browserOpenCommand(url: string): string[] {
  if (process.platform === "win32") return ["cmd.exe", "/c", "start", "", url];
  if (process.platform === "darwin") return ["open", url];
  return ["xdg-open", url];
}

import { exec } from "node:child_process";
import { createServer, type Server } from "node:http";
import { renderHtml } from "./renderer.ts";
import { buildViewModel } from "./view-model.ts";
import { serverRef } from "../server/signals.ts";

let webServer: Server | undefined;
let webPort = 0;
let lastRequestAt = 0;
let idleTimer: ReturnType<typeof setInterval> | undefined;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const IDLE_CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

function startIdleTimer(): void {
  if (idleTimer) return;
  lastRequestAt = Date.now();
  idleTimer = setInterval(() => {
    if (webServer && Date.now() - lastRequestAt > IDLE_TIMEOUT_MS) {
      console.log("[omo-monitor] WebUI idle timeout reached, shutting down server");
      closeWebUi();
    }
  }, IDLE_CHECK_INTERVAL_MS);
  idleTimer.unref();
}

export function closeWebUi(): void {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = undefined;
  }
  if (webServer) {
    try {
      webServer.close();
    } catch {
      // Best-effort close
    }
    webServer = undefined;
    webPort = 0;
    delete serverRef.current;
  }
}

export async function ensureWebUi(): Promise<string> {
  if (webServer && webPort > 0) return `http://127.0.0.1:${webPort}`;

  await new Promise<void>((resolveReady, rejectReady) => {
    const server = createServer((request, response) => {
      lastRequestAt = Date.now();
      const url = request.url ?? "/";
      if (url === "/state") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify(buildViewModel()));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(renderHtml());
    });

    webServer = server;
    serverRef.current = server;
    server.once("error", (err) => {
      webServer = undefined;
      webPort = 0;
      delete serverRef.current;
      rejectReady(err);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address?.port) {
        webPort = address.port;
        startIdleTimer();
        resolveReady();
        return;
      }
      webServer = undefined;
      delete serverRef.current;
      rejectReady(new Error("无法获取 OMO monitor WebUI 端口"));
    });
  });

  return `http://127.0.0.1:${webPort}`;
}

export function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      exec(`start "" "${url}"`, (error) => {
        if (error) {
          console.warn(`[omo-monitor] browser open failed: ${error.message}`);
        }
      });
      return;
    }
    if (process.platform === "darwin") {
      exec(`open "${url}"`, (error) => {
        if (error) {
          console.warn(`[omo-monitor] browser open failed: ${error.message}`);
        }
      });
      return;
    }
    exec(`xdg-open "${url}"`, (error) => {
      if (error) {
        console.warn(`[omo-monitor] browser open failed: ${error.message}`);
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[omo-monitor] browser open error: ${message}`);
  }
}

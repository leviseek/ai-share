import { exec } from "node:child_process";
import { createServer, type Server } from "node:http";
import { renderHtml } from "./renderer.ts";
import { buildViewModel } from "./view-model.ts";

let webServer: Server | undefined;
let webPort = 0;

export async function ensureWebUi(): Promise<string> {
  if (webServer && webPort > 0) return `http://127.0.0.1:${webPort}`;

  await new Promise((resolveReady, rejectReady) => {
    const server = createServer((request, response) => {
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
    server.once("error", rejectReady);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address?.port) {
        webPort = address.port;
        resolveReady(undefined);
        return;
      }
      rejectReady(new Error("无法获取 OMO monitor WebUI 端口"));
    });
  });

  return `http://127.0.0.1:${webPort}`;
}

export function openBrowser(url: string): void {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }
  if (process.platform === "darwin") {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureWebUi, openStandaloneWindow } from "./tui/web-server.ts";
import { openTauriWindow } from "./tui/tauri-window.ts";

const instanceLockPath = join(
  process.env.USERPROFILE ?? process.env.HOME ?? ".",
  ".config",
  "opencode",
  "live2d-pet.lock",
);

if (!(await acquireInstanceLock(instanceLockPath))) {
  process.exit(0);
}

const url = await ensureWebUi();
try {
  console.log(`Live2D pet window: ${url}`);
  let child;
  try {
    child = openTauriWindow(url);
  } catch {
    child = undefined;
  }
  child ??= openBrowserFallbackWindow(url);
  const stopChild = () => {
    try {
      child.kill();
    } catch {
      // Best-effort cleanup.
    }
  };
  process.on("SIGINT", stopChild);
  process.on("SIGTERM", stopChild);
  await child.exited;
} catch {
  console.error("无法启动 Live2D 独立窗口。请确认已构建 Tauri 应用，或系统已安装 Chromium/Edge/Chrome。\n");
  process.exitCode = 1;
} finally {
  releaseInstanceLock(instanceLockPath);
}

function openBrowserFallbackWindow(url: string) {
  if (process.env.AI_SHARE_LIVE2D_BROWSER_FALLBACK === "0") {
    throw new Error("Live2D pet browser fallback is disabled.");
  }
  return openStandaloneWindow(url);
}

async function acquireInstanceLock(lockPath: string): Promise<boolean> {
  if (existsSync(lockPath)) {
    try {
      const pid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        process.kill(pid, 0);
        return false;
      }
    } catch {
      // Stale or unreadable lock; remove and retry.
    }
    try {
      rmSync(lockPath);
    } catch {
      return false;
    }
  }

  try {
    writeFileSync(lockPath, String(process.pid), { encoding: "utf8", flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function releaseInstanceLock(lockPath: string): void {
  try {
    if (existsSync(lockPath)) {
      rmSync(lockPath);
    }
  } catch {
    // Best-effort cleanup.
  }
}

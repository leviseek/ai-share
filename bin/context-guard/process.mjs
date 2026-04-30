export function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stopProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill.exe", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Best effort shutdown; the launcher can still exit if the child already ended.
  }
}

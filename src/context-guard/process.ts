export function normalizePath(path: unknown): string {
  const value = typeof path === "string" ? path : "";
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function stopProcessTree(pid: number, graceMs = 5000): Promise<void> {
  if (!pid || pid <= 0) return;

  if (process.platform === "win32") {
    // Step 1: Try graceful shutdown first (without /F)
    Bun.spawnSync(["taskkill.exe", "/PID", String(pid), "/T"], {
      stdout: "ignore", stderr: "ignore",
    });

    // Step 2: Wait up to graceMs for the process to exit on its own
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      await sleep(500);
      if (!processAlive(pid)) return;
    }

    // Step 3: Force kill if still alive after grace period
    Bun.spawnSync(["taskkill.exe", "/PID", String(pid), "/T", "/F"], {
      stdout: "ignore", stderr: "ignore",
    });
    return;
  }

  // POSIX: SIGTERM first — OpenCode handles this via signals.ts (persist state + clean exit)
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return; // Process already dead
  }

  // Wait up to graceMs for clean shutdown
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    await sleep(500);
    if (!processAlive(pid)) return;
  }

  // Force kill if graceful shutdown timed out
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Best effort
  }
}

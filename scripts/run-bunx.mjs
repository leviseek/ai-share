import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const scriptPath = dirname(fileURLToPath(import.meta.url));
const runBunPath = join(scriptPath, "run-bun.mjs");

const result = spawnSync(process.execPath, [runBunPath, "x", ...args], {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`bunx 包装进程被信号 ${result.signal} 终止。`);
  process.exit(1);
}

process.exit(result.status ?? 1);

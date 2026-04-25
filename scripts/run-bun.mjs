import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const candidates = [
  process.env.npm_execpath,
  process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", executable("bun")) : undefined,
  process.env.npm_execpath ? join(dirname(process.env.npm_execpath), executable("bun")) : undefined,
  "bun",
].filter(Boolean);

const bun = candidates.find((candidate) => candidate === "bun" || existsSync(candidate));

if (!bun) {
  console.error("找不到 Bun 可执行文件。");
  process.exit(1);
}

const result = spawnSync(bun, args, {
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
  console.error(`Bun 进程被信号 ${result.signal} 终止。`);
  process.exit(1);
}

process.exit(result.status ?? 1);

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

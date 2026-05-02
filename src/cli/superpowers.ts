import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathExists } from "./fs.ts";

export const SUPERPOWERS_PLUGIN = "superpowers@git+https://github.com/obra/superpowers.git";

export const REQUIRED_SUPERPOWERS_SKILLS = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "test-driven-development",
  "verification-before-completion",
] as const;

export type SuperpowersInstallState = {
  packageDir: string | null;
  missingSkills: string[];
};

export async function findSuperpowersPackageDir(homeDir: string = homedir()): Promise<string | null> {
  const packageCacheDir = join(homeDir, ".cache", "opencode", "packages");
  if (!(await pathExists(packageCacheDir))) return null;

  return findSuperpowersPackageDirInTree(packageCacheDir, 0);
}

async function findSuperpowersPackageDirInTree(directory: string, depth: number): Promise<string | null> {
  const packageDir = join(directory, "node_modules", "superpowers");
  if (await pathExists(join(packageDir, "package.json"))) return packageDir;
  if (depth >= 6) return null;

  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const found = await findSuperpowersPackageDirInTree(join(directory, entry.name), depth + 1);
    if (found) return found;
  }

  return null;
}

export async function superpowersInstallState(homeDir: string = homedir()): Promise<SuperpowersInstallState> {
  const packageDir = await findSuperpowersPackageDir(homeDir);
  if (!packageDir) return { packageDir: null, missingSkills: [...REQUIRED_SUPERPOWERS_SKILLS] };

  const missingSkills: string[] = [];
  for (const skillName of REQUIRED_SUPERPOWERS_SKILLS) {
    if (!(await pathExists(join(packageDir, "skills", skillName, "SKILL.md")))) missingSkills.push(skillName);
  }

  return { packageDir, missingSkills };
}

export async function warmUpSuperpowersPlugin(enabledPlugins: string[]): Promise<void> {
  if (!enabledPlugins.includes(SUPERPOWERS_PLUGIN)) return;

  let lastDetail = "opencode run failed";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = spawnSync("opencode", ["run", "Tell me about your superpowers"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    lastDetail = (result.stderr || result.stdout || lastDetail).trim();
    if (result.status !== 0) continue;

    const state = await superpowersInstallState();
    if (state.missingSkills.length === 0) return;
    lastDetail = `缺少 Superpowers skills：${state.missingSkills.join(", ")}`;
  }

  console.warn(`WARN Superpowers 插件预热未完成：${lastDetail}`);
  console.warn('WARN 请运行 aiomo doctor install，或在网络可用时运行：opencode run "Tell me about your superpowers"。');
}

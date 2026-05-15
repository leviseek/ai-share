import { mkdir, copyFile, writeFile, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, "../..");
const AI_MEMORY_DIR = join(PROJECT_ROOT, "..", "ai-memory");
const MEMORY_DIR = join(PROJECT_ROOT, "memory");

interface CopySpec {
  source: string;
  dest: string;
}

const COPY_MAP: CopySpec[] = [
  { source: "stable/user.yaml", dest: "stable/user.yaml" },
  { source: "stable/workflows.yaml", dest: "stable/workflows.yaml" },
  { source: "stable/devices.yaml", dest: "stable/devices.yaml" },
  { source: "profiles/coding.yaml", dest: "profiles/coding.yaml" },
  { source: "profiles/research.yaml", dest: "profiles/research.yaml" },
  { source: "profiles/infra.yaml", dest: "profiles/infra.yaml" },
  { source: "policies/memory-policy.yaml", dest: "policies/memory-policy.yaml" },
];

const GITKEEP_DIRS = ["stable", "profiles", "policies", "inferred", "distilled"];

const NEW_DIRS = [...GITKEEP_DIRS, "runtime", "sync"];

interface Stats {
  copied: number;
  skipped: number;
  dirsCreated: number;
}

async function createDirIfNotExists(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  }
}

async function copyIfNotExists(src: string, dest: string): Promise<"copied" | "skipped"> {
  try {
    await stat(dest);
    return "skipped";
  } catch {
    // dest doesn't exist, proceed with copy
  }

  try {
    await copyFile(src, dest);
    return "copied";
  } catch (error) {
    if (isNotFound(error)) {
      console.error(`  未找到源文件：${src}`);
    }
    throw error;
  }
}

async function ensureGitkeep(dir: string): Promise<void> {
  const gitkeepPath = join(dir, ".gitkeep");
  try {
    await stat(gitkeepPath);
    // already exists
  } catch {
    await writeFile(gitkeepPath, "");
  }
}

async function updateGitignore(): Promise<void> {
  const gitignorePath = join(PROJECT_ROOT, ".gitignore");
  const rulesToAdd = ["memory/runtime/", "memory/sync/"];

  let existingContent = "";
  try {
    existingContent = await readFile(gitignorePath, "utf-8");
  } catch {
    // .gitignore doesn't exist, will create new
  }

  const lines = new Set(existingContent.split(/\r?\n/).map((l) => l.trim()));
  const newRules = rulesToAdd.filter((rule) => !lines.has(rule));

  if (newRules.length === 0) return;

  const append = `\n### Migrated memory runtime/sync\n${newRules.join("\n")}\n`;
  await writeFile(gitignorePath, existingContent + append);
  for (const rule of newRules) {
    console.log(`  已添加 .gitignore 规则：${rule}`);
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

async function main(): Promise<void> {
  console.log("=== 迁移 ai-memory → ai-share/memory/ ===\n");

  const stats: Stats = { copied: 0, skipped: 0, dirsCreated: 0 };

  // 1. Check if source ai-memory exists
  try {
    await stat(AI_MEMORY_DIR);
  } catch (error) {
    if (isNotFound(error)) {
      console.log("未找到 ../ai-memory 仓库，跳过迁移。");
      console.log("如需迁移，请确保 ai-memory 仓库位于 ai-share 同级目录。\n");
      return;
    }
    throw error;
  }

  // 2. Create new memory directories
  console.log("创建目录：");
  for (const subdir of NEW_DIRS) {
    const dirPath = join(MEMORY_DIR, subdir);
    const created = await createDirIfNotExists(dirPath);
    if (created) {
      stats.dirsCreated++;
      console.log(`  + ${subdir}/`);
    } else {
      console.log(`  ✓ ${subdir}/ （已存在）`);
    }
  }

  // 3. Copy source files
  console.log("\n复制文件：");
  for (const spec of COPY_MAP) {
    const src = join(AI_MEMORY_DIR, spec.source);
    const dest = join(MEMORY_DIR, spec.dest);
    const result = await copyIfNotExists(src, dest);
    if (result === "copied") {
      stats.copied++;
      console.log(`  + ${spec.dest}`);
    } else {
      stats.skipped++;
      console.log(`  已跳过 ${spec.dest} （已存在）`);
    }
  }

  // 4. Place .gitkeep files
  console.log("\n写入 .gitkeep：");
  for (const subdir of GITKEEP_DIRS) {
    const dirPath = join(MEMORY_DIR, subdir);
    await ensureGitkeep(dirPath);
    console.log(`  ✓ ${subdir}/.gitkeep`);
  }

  // 5. Update .gitignore
  console.log("\n更新 .gitignore：");
  await updateGitignore();

  // 6. Summary
  console.log(`\n迁移完成。统计：`);
  console.log(`  已复制：${stats.copied} 个文件`);
  console.log(`  已跳过：${stats.skipped} 个文件`);
  console.log(`  新目录：${stats.dirsCreated} 个`);
}

await main();

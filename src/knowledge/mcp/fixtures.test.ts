import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildKnowledge } from "../index.ts";
import { createJsonlKnowledgeStore, writeBuildResult } from "../storage/jsonl-store.ts";

export async function createMcpFixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rie-mcp-fixture-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "README.md"), "# Demo\n\nRepository intelligence fixture.\n");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { check: "tsc" } }));
  await writeFile(join(root, "src", "main.ts"), "export function main() { return 1; }\n");
  return root;
}

export async function writeFixtureSnapshot(repoRoot: string, storeName = ".rie"): Promise<void> {
  const result = await buildKnowledge({ repoRoot });
  await writeBuildResult(createJsonlKnowledgeStore(join(repoRoot, storeName)), result);
}

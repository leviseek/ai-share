import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { buildInstructionsPaths as facadeBuildInstructionsPaths } from "../../config-builders.ts";
import { buildInstructionsPaths } from "./instructions.ts";

const tempRoots: string[] = [];
const basePaths = [
  "AI_GUIDELINES.md",
  "memory/policies/ai-execution-contract.md",
  "memory/policies/memory-lifecycle.md",
  "memory/stable/user.yaml",
  "memory/stable/workflows.yaml",
  "memory/stable/devices.yaml",
] as const;

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("buildInstructionsPaths", () => {
  test("injects exactly six unique base files in stable order", () => {
    const root = makeProjectRoot();
    const paths = buildInstructionsPaths(root, "");
    expect(paths).toEqual(basePaths.map((path) => resolve(root, path)));
    expect(new Set(paths).size).toBe(paths.length);
    expect(facadeBuildInstructionsPaths(root, "")).toEqual(paths);
  });

  test("inserts at most three unique task memories before stable facts", () => {
    const root = makeProjectRoot();
    write(root, "memory/architecture/context.md", "# Context Compiler\nTask retrieval unique-sentinel.\n");
    write(root, "memory/stack/other.md", "# Other\nunique-sentinel supporting context.\n");
    const paths = buildInstructionsPaths(root, "unique-sentinel");
    expect(paths[3]).toBe(resolve(root, "memory/architecture/context.md"));
    expect(paths.indexOf(resolve(root, "memory/stable/user.yaml"))).toBeGreaterThan(3);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test("loads only confirmed distilled entries and excludes the template", () => {
    const root = makeProjectRoot();
    write(
      root,
      "memory/distilled/confirmed.md",
      "---\nconfirmed_by_user: true\n---\n# Confirmed\ndistilled-sentinel\n",
    );
    write(root, "memory/distilled/unconfirmed.md", "---\nconfirmed_by_user: false\n---\n# Draft\ndistilled-sentinel\n");
    write(
      root,
      "memory/distilled/spoofed.md",
      "---\nconfirmed_by_user: false\n---\n# Spoofed\ndistilled-sentinel\nconfirmed_by_user: true\n",
    );
    write(root, "memory/distilled/TEMPLATE.md", "---\nconfirmed_by_user: true\n---\n# Template\ndistilled-sentinel\n");
    write(root, "memory/distilled/confirmed.yaml", "confirmed_by_user: true\nsummary: distilled-sentinel\n");
    write(root, "memory/distilled/malformed.yaml", "summary: |\nconfirmed_by_user: true\ndistilled-sentinel\n");
    write(
      root,
      "memory/distilled/malformed.md",
      "---\nsummary: |\nconfirmed_by_user: true\n---\n# Malformed\ndistilled-sentinel\n",
    );
    const paths = buildInstructionsPaths(root, "distilled-sentinel");
    expect(paths).toContain(resolve(root, "memory/distilled/confirmed.md"));
    expect(paths).toContain(resolve(root, "memory/distilled/confirmed.yaml"));
    expect(paths).not.toContain(resolve(root, "memory/distilled/unconfirmed.md"));
    expect(paths).not.toContain(resolve(root, "memory/distilled/spoofed.md"));
    expect(paths).not.toContain(resolve(root, "memory/distilled/malformed.yaml"));
    expect(paths).not.toContain(resolve(root, "memory/distilled/malformed.md"));
    expect(paths).not.toContain(resolve(root, "memory/distilled/TEMPLATE.md"));
  });
});

function makeProjectRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "ai-share-instructions-"));
  tempRoots.push(root);
  for (const path of basePaths) write(root, path, `# ${path}\n`);
  return root;
}

function write(root: string, path: string, content: string): void {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

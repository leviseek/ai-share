import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { buildInstructionsPaths as facadeBuildInstructionsPaths } from "../../config-builders.ts";
import { buildInstructionsPaths, buildInstructionsSelection } from "./instructions.ts";
import { searchMemoryDetailed } from "../../memory/retrieval.ts";

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

  test("explains deterministic scores, selection, and policy exclusions", () => {
    const root = makeProjectRoot();
    write(root, "memory/architecture/windows.md", "# Windows Transaction\ntransaction rollback content.\n");
    write(root, "memory/stack/transaction.md", "# Other\ntransaction supporting content.\n");
    write(
      root,
      "memory/distilled/unconfirmed.md",
      "---\nconfirmed_by_user: false\n---\n# Draft\ntransaction rollback\n",
    );
    write(root, "memory/distilled/malformed.md", "# Missing metadata\ntransaction rollback\n");
    write(
      root,
      "memory/distilled/TEMPLATE.md",
      "---\nconfirmed_by_user: true\n---\n# Template\ntransaction rollback\n",
    );

    const detailed = searchMemoryDetailed("windows transaction rollback", root);
    const first = detailed.ranked_candidates[0];
    expect(first?.path).toBe("memory/architecture/windows.md");
    expect(first?.rank).toBe(1);
    expect(first?.selected).toBe(true);
    expect(first?.total_score).toBe(
      (first?.score_breakdown.title ?? 0) + (first?.score_breakdown.path ?? 0) + (first?.score_breakdown.content ?? 0),
    );
    expect(first?.matched_tokens.title).toContain("windows");
    expect(first?.matched_tokens.path).toContain("windows");
    expect(first?.matched_tokens.content).toContain("rollback");
    expect(detailed.policy_exclusions).toEqual([
      { path: "memory/distilled/TEMPLATE.md", reason: "template" },
      { path: "memory/distilled/malformed.md", reason: "malformed-distilled" },
      { path: "memory/distilled/unconfirmed.md", reason: "unconfirmed-distilled" },
    ]);

    const selection = buildInstructionsSelection(root, "windows transaction rollback");
    expect(selection.memory).toEqual(detailed);
    expect(selection.paths.slice(3, 3 + selection.memory.selected.length)).toEqual(
      selection.memory.selected.map((result) => resolve(root, result.path)),
    );
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
